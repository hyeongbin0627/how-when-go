import { NextResponse } from 'next/server';

const BASE = 'https://apis.data.go.kr/1613000/ExpBusInfo';
const KEY = process.env.KORAIL_API_KEY!; // 같은 키 사용

// 터미널 코드 맵 (테스트로 확인한 값)
const TERMINALS: Record<string, { id: string; label: string }> = {
  서울경부: { id: 'NAEK010', label: '서울경부터미널' },
  센트럴시티: { id: 'NAEK020', label: '센트럴시티(서울)' },
  동서울: { id: 'NAEK030', label: '동서울터미널' },
  대전: { id: 'NAEK300', label: '대전복합터미널' },
  부산: { id: 'NAEK700', label: '부산종합터미널' },
  광주: { id: 'NAEK500', label: '광주터미널' },
  대구: { id: 'NAEK400', label: '대구북부터미널' },
};

function parseTime(plandTime: number | string): string {
  const s = String(plandTime);
  return s.slice(-4).replace(/(\d{2})(\d{2})/, '$1:$2');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const depKey = searchParams.get('dep') ?? '서울경부';
  const arrKey = searchParams.get('arr') ?? '대전';
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const dep = TERMINALS[depKey];
  const arr = TERMINALS[arrKey];
  if (!dep || !arr) {
    return NextResponse.json({ error: '지원하지 않는 터미널입니다.' }, { status: 400 });
  }

  const url =
    `${BASE}/GetStrtpntAlocFndExpbusInfo?serviceKey=${KEY}` +
    `&numOfRows=100&pageNo=1` +
    `&depTerminalId=${dep.id}&arrTerminalId=${arr.id}` +
    `&depPlandTime=${date}&_type=json`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    const data = await res.json();
    const raw = data?.response?.body?.items?.item ?? [];
    const items = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length ? [raw] : []);

    const buses = items.map((b: Record<string, unknown>) => ({
      routeId: b.routeId,
      dep: parseTime(b.depPlandTime as number),
      arr: parseTime(b.arrPlandTime as number),
      depStation: b.depPlaceNm,
      arrStation: b.arrPlaceNm,
      grade: b.gradeNm,
      charge: b.charge,
    }));

    return NextResponse.json({ buses, dep: dep.label, arr: arr.label, date });
  } catch (e) {
    return NextResponse.json({ error: '버스 정보를 불러오지 못했습니다.', detail: String(e) }, { status: 500 });
  }
}
