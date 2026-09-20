# 자리왔나

버스와 KTX 빈자리 알림을 체험하는 Next.js + TypeScript 모바일 목업.

다음 작업자는 [인수인계 보고서](HANDOFF.md)와 [다음 AI용 실행 프롬프트](NEXT_AI_PROMPT.md)를 먼저 확인합니다.

## 실행

```sh
npm install
npm run dev
```

http://localhost:3000 에서 확인합니다.

## 확인 / 배포 준비

```sh
npm run typecheck
npm run build
```

빌드하면 `out`에 정적 사이트가 생성됩니다. Vercel 등 정적 호스팅에 배포할 수 있습니다.

## 체험

고속버스 또는 KTX 선택 → 매진 시간 선택 → 알림 설정 → 빈자리 예시 보기 → 예약 안내 확인.

모든 노선, 열차 번호, 시간, 좌석은 가상 데이터입니다. 실제 조회, 메시지 발송, 예약, 영구 저장은 지원하지 않습니다.
