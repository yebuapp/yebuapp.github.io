/* 예부 서비스워커 — 네트워크 우선, 실패 시 캐시(오프라인 폴백).
   캐시 키는 빌드마다 바뀌어(8d5bd1f3d1) 구버전이 눌러앉지 않는다. */
var CACHE = 'yebu-8d5bd1f3d1';
var ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  /* 우리 출처의 것만 다룬다.
     예전에는 출처를 가리지 않고 모든 GET 을 이 캐시에 넣었다. 그래서 Supabase 의
     읽기(.select() = GET) 응답까지 들어갔고, 네트워크가 끊기면 낡은 동기화 상태를
     신선한 것처럼 돌려주었다. 더 나쁜 것은 캐시에 없을 때의 폴백이었다 — JSON 을
     기다리는 요청에 index.html 을 200 으로 돌려주어, 클라이언트가 그 HTML 전문을
     오류 메시지에 담은 채 '동기화 실패'를 띄웠다(2026-09-07 코드로 확인).
     구글 폰트와 분석 비콘도 여기서 빠진다. 오프라인에서 글꼴이 시스템 글꼴로
     떨어지는 것을 감수하는 대신, 남의 응답을 우리가 보관하지 않는다. */
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request).then(function (res) {
      // 성공한 응답만 보관한다 — 오류를 캐시에 넣으면 오프라인에서 그 오류가 되살아난다.
      if (res && res.ok) {
        var copy = res.clone();
        /* 응답을 돌려준 순간 워커는 언제든 종료될 수 있다 — 캐시 쓰기는 waitUntil 로
           수명을 연장해야 끝까지 간다. put 이 던지면(예: 206 부분 응답은 ok 인데
           Cache API 가 거부한다) 캐시만 포기하고 조용히 넘어간다. */
        e.waitUntil(
          caches.open(CACHE)
            .then(function (c) { return c.put(e.request, copy); })
            .catch(function () {})
        );
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        if (hit) return hit;
        /* 앱 껍데기로 되돌리는 것은 '문서를 열려는 요청'일 때만이다.
           그 밖의 자원(이미지·JSON 등)에 HTML 을 주면 받는 쪽이 그것을 제 형식으로
           읽으려다 엉뚱한 곳에서 실패한다. 없으면 없다고 답하는 편이 정직하다. */
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});

/* 웹푸시 수신 — 서버(Edge Function)가 보낸 JSON({title, body, tag})을 그대로 표시한다. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || '예부', {
    body: d.body || '',
    tag: d.tag || 'yebu',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) { if ('focus' in ws[i]) return ws[i].focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
