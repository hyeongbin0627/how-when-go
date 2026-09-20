const key = 'da6f0998b164e339129ffb91c304cbfdd8ea1b4e12fc2e38e0ff3a46a331ae78';
const base = 'https://apis.data.go.kr/B551457/run/v2';

async function main() {
  // 9월 26일 운행계획 전체 가져오기 (여러 페이지)
  let allItems = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(base + '/travelerTrainRunPlan2?serviceKey=' + key + '&numOfRows=1000&pageNo=' + page + '&opDt=20260926');
    const d = await r.json();
    const items = d?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    allItems = allItems.concat(arr);
    const total = d?.response?.body?.totalCount || 0;
    console.log('페이지', page, '/ 총', total, '건 / 가져온 건수:', allItems.length);
    if (allItems.length >= total) break;
  }
  
  // 서울 출발 → 대전 도착 필터
  const seoulToDaejeon = allItems.filter(i =>
    i.dptre_stn_cd === '3900023' && i.arvl_stn_cd === '3900073'
  ).sort((a, b) => a.trn_plan_dptre_dt.localeCompare(b.trn_plan_dptre_dt));
  
  console.log('\n=== 서울→대전 (9월 26일) ===');
  console.log('편수:', seoulToDaejeon.length);
  seoulToDaejeon.forEach(t => {
    const dep = t.trn_plan_dptre_dt?.substring(11, 16);
    const arr = t.trn_plan_arvl_dt?.substring(11, 16);
    console.log(`열차 ${t.trn_no} | ${dep} → ${arr}`);
  });
}

main().catch(console.error);
