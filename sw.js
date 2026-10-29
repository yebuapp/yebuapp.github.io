/* 예부 서비스워커 — 네트워크 우선, 실패 시 캐시(오프라인 폴백).
   캐시 키는 빌드마다 바뀌어(6dc49de0ae) 구버전이 눌러앉지 않는다. */
var CACHE = 'yebu-6dc49de0ae';
var ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
/* 시·도별 지역 제도 파일(rd/r-<코드>-<내용 해시>.json, plan 112) — 이름에 내용 해시가 들어 있어
   같은 이름이면 같은 내용이다. 그래서 빌드마다 바뀌는 CACHE 가 아니라 따로 둔 캐시에 '캐시 우선'으로 둔다:
   데이터가 그대로인 시·도는 배포가 바뀌어도 다시 받지 않는다. 활성화 때 지금 목록(RD_FILES) 밖 파일만 지운다. */
var RD_CACHE = 'yebu-rd';
var RD_FILES = ["r-gangwon-45ba54fe.json","r-gyeonggi-be160694.json","r-gyeongnam-0a59463f.json","r-gyeongbuk-a77f4704.json","r-daegu-073adae1.json","r-daejeon-b4e1aa10.json","r-busan-67953a5a.json","r-seoul-2060c931.json","r-sejong-6e9f4aa8.json","r-ulsan-f9c6bec6.json","r-incheon-bc930d68.json","r-jeonnam-gwangju-996fcb99.json","r-jeonbuk-4a0e1f9a.json","r-jeju-13fb8c45.json","r-chungnam-f180f5c1.json","r-chungbuk-22608c92.json"];
var RD_RE = /\/rd\/r-[a-z0-9-]+-[0-9a-f]{8}\.json$/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== RD_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () {
    return caches.open(RD_CACHE).then(function (c) {
      return c.keys().then(function (reqs) {
        return Promise.all(reqs.filter(function (r) {
          return RD_FILES.indexOf(new URL(r.url).pathname.split('/').pop()) < 0;
        }).map(function (r) { return c.delete(r); }));
      });
    }).catch(function () {});
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

  /* 시·도 파일 — 캐시 우선. 쿼리가 붙은 주소는 여기로 오지 않고 아래 일반 경로를 탄다(쿼리 주소 미캐시 규칙 그대로).
     성공한 응답만 넣는다. 캐시에도 없고 네트워크도 실패하면 그대로 실패를 돌려준다 — HTML 을 대신 주지 않는다. */
  if (!url.search && RD_RE.test(url.pathname)) {
    e.respondWith(
      caches.open(RD_CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (res) {
            if (!(res && res.ok)) return res;
            return c.put(e.request, res.clone()).catch(function () {}).then(function () { return res; });
          });
        });
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request).then(function (res) {
      // 성공한 응답만 보관한다 — 오류를 캐시에 넣으면 오프라인에서 그 오류가 되살아난다.
      /* 쿼리 문자열이 있는 주소는 보관하지 않는다 — 지역 안내 페이지에서 넘어온 ?r=시도|시군구 같은 값이
         캐시 키로 남기 때문이다. 응답은 그대로 돌려준다(오프라인 첫 화면은 쿼리 없는 ./index.html 로 뜬다). */
      if (res && res.ok && !url.search) {
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
