import { NextResponse } from 'next/server';

const BASE = 'https://apis.data.go.kr/1613000/TrainInfo';
const KEY = process.env.KORAIL_API_KEY || 'da6f0998b164e339129ffb91c304cbfdd8ea1b4e12fc2e38e0ff3a46a331ae78';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const depId = searchParams.get('depId') ?? 'NAT010000';
  const arrId = searchParams.get('arrId') ?? 'NAT011668';
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const url =
    `${BASE}/GetStrtpntAlocFndTrainInfo?serviceKey=${KEY}` +
    `&numOfRows=1000&pageNo=1&_type=json&depPlaceId=${depId}&arrPlaceId=${arrId}&depPlandTime=${date}`;

  try {
    if (!KEY) throw new Error('Missing key');
    const stations: Record<string, string[]> = { NAT010000: ['NAT010000', 'NAT010032'], NAT011668: ['NAT011668', 'NAT030057'], NAT031857: ['NAT031857', 'NAT883012'] };
    const items = (await Promise.all((stations[depId] ?? [depId]).flatMap(dep => (stations[arrId] ?? [arrId]).map(async arr => {
      const rows: any[] = [];
      for (let page = 1; page <= 50; page++) {
        const query = new URLSearchParams({serviceKey: decodeURIComponent(KEY.trim()), numOfRows: '100', pageNo: String(page), _type: 'json', depPlaceId: dep, arrPlaceId: arr, depPlandTime: date});
        const res = await fetch(`${BASE}/GetStrtpntAlocFndTrainInfo?${query}`, {next: {revalidate: 300}, signal: AbortSignal.timeout(20000)});
        if (!res.ok) throw new Error('Upstream error');
        const data = await res.json();
        if (String(data.response?.header?.resultCode) !== '00') throw new Error('API error');
        const raw = data.response?.body?.items?.item;
        const chunk = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
        rows.push(...chunk);
        if (!chunk.length || rows.length >= Number(data.response.body.totalCount)) return rows;
      }
      throw new Error('Incomplete timetable');
    })))).flat();

    // 출발시간 순 정렬 및 포맷팅
    const trains = items
      .filter(t => t.depplandtime && t.arrplandtime)
      .map((t) => {
        const no = String(t.trainno).replace(/^0+/, ''); // 앞의 0 제거 (00301 -> 301)
        
        // SRT 판별: 수서발이거나, 열차번호가 300번대이거나 4000번대(SRT 임시/추가)인 경우
        const isSrt = t.depplacename === '수서' || t.arrplacename === '수서' || /SRT/i.test(String(t.traingradename));

        let type = 'ktx';
        let grade = String(t.traingradename ?? '일반열차');
        t.depplandtime = String(t.depplandtime);
        t.arrplandtime = String(t.arrplandtime);
        
        if (isSrt) {
          type = 'srt';
          grade = 'SRT';
        } else if (!grade.includes('KTX')) {
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

    const unique = [...new Map(trains.slice().reverse().map(t => [`${t.type}-${t.no}`, t])).values()].sort((a,b) => a.depFull.localeCompare(b.depFull));
    return NextResponse.json({ trains: unique, date });
  } catch (e) {
    return NextResponse.json({ error: '열차 정보를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.' }, { status: 502 });
  }
}
