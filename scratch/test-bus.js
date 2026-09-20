const key = 'da6f0998b164e339129ffb91c304cbfdd8ea1b4e12fc2e38e0ff3a46a331ae78';
const base = 'https://apis.data.go.kr/1613000/ExpBusInfo';

async function main() {
  const today = new Date();
  today.setHours(today.getHours() + 9);
  const dateStr = today.toISOString().slice(0,10).replace(/-/g,'');

  const r = await fetch(`${base}/GetStrtpntAlocFndExpbusInfo?serviceKey=${key}&numOfRows=100&pageNo=1&depTerminalId=NAEK010&arrTerminalId=NAEK300&depPlandTime=${dateStr}&_type=json`);
  const d = await r.json();
  const items = d?.response?.body?.items?.item ?? [];
  const arr = Array.isArray(items) ? items : [items];
  console.log('전체 편수:', arr.length);
  console.log('첫 5개:');
  arr.slice(0,5).forEach(b => {
    const dep = String(b.depPlandTime).slice(-4).replace(/(\d{2})(\d{2})/, '$1:$2');
    const arrT = String(b.arrPlandTime).slice(-4).replace(/(\d{2})(\d{2})/, '$1:$2');
    console.log(`${dep}→${arrT} | ${b.gradeNm} | ${b.charge?.toLocaleString()}원`);
  });
  // 전체 필드 확인
  console.log('\n필드 목록:', Object.keys(arr[0] || {}));
}
main().catch(console.error);
