import { NextResponse } from 'next/server';

const BASE = 'https://apis.data.go.kr/1613000/TrainInfo';
const KEY = process.env.KORAIL_API_KEY!; // KORAIL_API_KEY is actually the same data.go.kr key

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const depId = searchParams.get('depId') ?? 'NAT010000';
  const arrId = searchParams.get('arrId') ?? 'NAT011668';
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const url =
    `${BASE}/GetStrtpntAlocFndTrainInfo?serviceKey=${KEY}` +
    `&numOfRows=1000&pageNo=1&_type=json&depPlaceId=${depId}&arrPlaceId=${arrId}&depPlandTime=${date}`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } }); // 5분 캐시
    const data = await res.json();
    const raw: any[] = data?.response?.body?.items?.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];

    // 출발시간 순 정렬 및 포맷팅
    const trains = items
      .filter(t => t.depplandtime && t.arrplandtime)
      .map((t) => {
        const no = String(t.trainno).replace(/^0+/, ''); // 앞의 0 제거 (00301 -> 301)
        
        // SRT 판별: 수서발이거나, 열차번호가 300번대이거나 4000번대(SRT 임시/추가)인 경우
        const isSrt = t.depplacename === '수서' || t.arrplacename === '수서' || 
                      (parseInt(no) >= 300 && parseInt(no) <= 399) || 
                      (parseInt(no) >= 4000 && parseInt(no) <= 4999 && !t.traingradename.includes('ITX'));

        let type = 'ktx';
        let grade = t.traingradename;
        
        if (isSrt) {
          type = 'srt';
          grade = 'SRT';
        } else if (grade.includes('무궁화') || grade.includes('ITX') || grade.includes('새마을')) {
          type = 'itx';
        }

        return {
          no,
          grade,
          type,
          dep: `${t.depplandtime.slice(8, 10)}:${t.depplandtime.slice(10, 12)}`,
          arr: `${t.arrplandtime.slice(8, 10)}:${t.arrplandtime.slice(10, 12)}`,
          depFull: t.depplandtime,
          arrFull: t.arrplandtime,
          depStation: t.depplacename,
          arrStation: t.arrplacename,
          charge: parseInt(t.adultcharge) || 0,
        };
      })
      .sort((a, b) => a.depFull.localeCompare(b.depFull));

    return NextResponse.json({ trains, date });
  } catch (e) {
    return NextResponse.json({ error: '열차 정보를 불러오지 못했습니다.', detail: String(e) }, { status: 500 });
  }
}
