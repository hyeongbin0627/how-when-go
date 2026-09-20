'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Bell, BusFront, CalendarDays, Check, ChevronRight,
  ExternalLink, Loader2, RefreshCw, ShieldCheck,
  TrainFront, TriangleAlert, Zap, TrendingDown, TrendingUp, Clock, Sparkles, Compass, Plane, TramFront
} from 'lucide-react';

/* ─── 드래그 스크롤 훅 ─── */
function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!ref.current) return;
    isDown.current = true;
    startX.current = e.pageX - ref.current.offsetLeft;
    scrollLeft.current = ref.current.scrollLeft;
  };
  const onMouseLeave = () => { isDown.current = false; };
  const onMouseUp = () => { isDown.current = false; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDown.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    ref.current.scrollLeft = scrollLeft.current - walk;
  };

  return { ref, onMouseDown, onMouseLeave, onMouseUp, onMouseMove };
}

/* ─── 타입 ─── */
type Mode = 'all' | 'ktx' | 'srt' | 'itx' | 'bus';
type Filter = 'all' | 'cheap' | 'fast' | 'expensive' | 'slow';

type BaseItem = { 
  id: string; type: 'ktx' | 'bus' | 'srt' | 'itx'; dep: string; arr: string; 
  depStation: string; arrStation: string; charge: number;
  isFastest?: boolean; isCheapest?: boolean; isSlowest?: boolean; isMostExpensive?: boolean;
  statusCode?: 'ended' | 'urgent';
};
type TrainItem = BaseItem & { type: 'ktx' | 'srt' | 'itx'; no: string; grade?: string; };
type BusItem   = BaseItem & { type: 'bus'; grade: string; };
type Item = TrainItem | BusItem;

/* ─── 도시 통합 맵핑 ─── */
const CITIES = ['서울', '대전', '부산', '동대구', '광주'];
const CITY_MAP: Record<string, { ktx: string; srt: string; bus: string }> = {
  서울: { ktx: 'NAT010000', srt: 'NATH30000', bus: '서울경부' },
  대전: { ktx: 'NAT011668', srt: 'NAT011668', bus: '대전' },
  부산: { ktx: 'NAT014445', srt: 'NAT014445', bus: '부산' },
  동대구: { ktx: 'NAT013271', srt: 'NAT013271', bus: '대구' },
  광주: { ktx: 'NAT031857', srt: 'NAT031857', bus: '광주' },
};

/* ─── 유틸 ─── */
function todayKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
function nowKSTMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function dateRange() {
  const days: string[] = [];
  const base = new Date(`${todayKST()}T00:00:00Z`);
  for (let i = 0; i < 14; i++) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dt = String(d.getUTCDate()).padStart(2, '0');
    days.push(`${y}-${m}-${dt}`);
  }
  return days;
}
function fmtDate(iso: string) {
  const [,m, dd] = iso.split('-');
  const day = ['일','월','화','수','목','금','토'][new Date(iso).getDay()];
  return `${m}월 ${dd}일 (${day})`;
}
function diffMin(dep: string, arr: string) {
  const [dh, dm] = dep.split(':').map(Number);
  const [ah, am] = arr.split(':').map(Number);
  const t = (ah * 60 + am) - (dh * 60 + dm);
  return t < 0 ? t + 1440 : t;
}
function fmtDur(min: number) {
  return `${Math.floor(min / 60)}시간 ${min % 60 > 0 ? (min % 60) + '분' : ''}`.trim();
}

/* ─── 메인 컴포넌트 ─── */
async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || '조회 실패');
  return data;
}
export default function Home() {
  const [realTime, setRealTime] = useState(new Date());
  const clockOffset = useRef(0);

  // 마우스 드래그 스크롤 상태
  const transportScroll = useDragScroll();
  const filterScroll = useDragScroll();

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const start = Date.now();
      try {
        const response = await fetch('/api/time', { cache: 'no-store' });
        const data = await response.json();
        if (active && Number.isFinite(data.now)) {
          clockOffset.current = data.now + (Date.now() - start) / 2 - Date.now();
          setRealTime(new Date(Date.now() + clockOffset.current));
        }
      } catch { /* 다음 동기화까지 기기 시간을 사용합니다. */ }
    };
    void sync();
    const timer = setInterval(() => setRealTime(new Date(Date.now() + clockOffset.current)), 1000);
    const syncTimer = setInterval(sync, 60000);
    window.addEventListener('focus', sync);
    return () => { active = false; clearInterval(timer); clearInterval(syncTimer); window.removeEventListener('focus', sync); };
  }, []);

  const [mode, setMode] = useState<Mode>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [dep, setDep] = useState('서울');
  const [arr, setArr] = useState('대전');
  const [date, setDate] = useState(todayKST());
  
  const [rawItems, setRawItems] = useState<Item[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);
  const [step, setStep] = useState(0); 
  const [page, setPage] = useState(1);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(24);
  const heading = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0);
  const availableModes = new Set(rawItems.filter(item => new Date(`${date}T${item.dep}:00+09:00`).getTime() > realTime.getTime()).map(item => item.type));
  useEffect(() => {
    if (!loading && mode !== 'all' && !availableModes.has(mode)) setMode('all');
  }, [rawItems, loading, mode, date, realTime]);

  // 데이터 로드
  const fetchData = useCallback(async () => {
    if (dep === arr) return;
    const currentRequest = ++requestId.current;
    setRawItems([]);
    setLoading(true); setError(''); setNotice(''); setSelected(null); setStep(0);
    try {
      const d = date.replace(/-/g, '');
      const ktxDep = CITY_MAP[dep].ktx;
      const ktxArr = CITY_MAP[arr].ktx;
      const busDep = CITY_MAP[dep].bus;
      const busArr = CITY_MAP[arr].bus;

      const dateNum = date.replace(/-/g, '');
      const reqs: Promise<Item[]>[] = [];

      // KTX & ITX/무궁화 (코레일 통신)
      {
        reqs.push(fetch(`/api/trains?depId=${CITY_MAP[dep].ktx}&arrId=${CITY_MAP[arr].ktx}&date=${dateNum}`)
          .then(readResponse)
          .then(d => (d.trains || []).filter((t: any) => {
            // mode === 'all'
            const depSrt = CITY_MAP[dep].srt;
            const arrSrt = CITY_MAP[arr].srt;
            const depKtx = CITY_MAP[dep].ktx;
            const arrKtx = CITY_MAP[arr].ktx;
            // 수서역 등 SRT 전용역을 별도로 호출하는 상황이라면, 본 통신(코레일)에서 나온 SRT는 뺌
            return true;
          }).map((t: any) => ({
            id: `${t.type}-${t.no}`, type: t.type, no: t.no, grade: t.grade,
            dep: t.dep, arr: t.arr, 
            depStation: t.depStation, arrStation: t.arrStation,
            charge: t.charge
          }))));
      }

      // SRT (출발지나 도착지의 SRT ID가 KTX ID와 다른 경우, 예: 수서역)
      {
        const depSrt = CITY_MAP[dep].srt;
        const arrSrt = CITY_MAP[arr].srt;
        const depKtx = CITY_MAP[dep].ktx;
        const arrKtx = CITY_MAP[arr].ktx;

        // 만약 srt 전용 역(수서 등)이 다르다면, SRT API를 따로 한번 더 호출해야 함
        if (depSrt !== depKtx || arrSrt !== arrKtx) {
          reqs.push(fetch(`/api/trains?depId=${depSrt}&arrId=${arrSrt}&date=${dateNum}`)
            .then(readResponse)
            .then(d => (d.trains || []).map((t: any) => ({
              id: `srt-${t.no}`, type: 'srt', no: t.no, grade: t.grade,
              dep: t.dep, arr: t.arr, 
              depStation: t.depStation, arrStation: t.arrStation,
              charge: t.charge
            }))));
        }
      }

      // BUS
      {
        reqs.push(fetch(`/api/buses?dep=${CITY_MAP[dep].bus}&arr=${CITY_MAP[arr].bus}&date=${dateNum}`)
          .then(readResponse)
          .then(d => (d.buses || []).map((b: any, idx: number) => ({
            id: `bus-${b.dep}-${idx}`, type: 'bus', grade: b.grade,
            dep: b.dep, arr: b.arr,
            depStation: dep, arrStation: arr,
            charge: b.charge
          }))));
      }

      const results = await Promise.allSettled(reqs);
      if (currentRequest !== requestId.current) return;
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length) setError('일부 교통편을 조회하지 못했습니다. 잠시 후 새로고침해 주세요.');
      let combined: Item[] = [];
      results.forEach(res => {
        if (res.status === 'fulfilled') {
          combined.push(...res.value);
        }
      });
      combined.sort((a, b) => a.dep.localeCompare(b.dep));
      if (!failures.length && !combined.some(item => item.type !== 'bus')) setNotice('선택한 날짜·구간의 열차 시간표가 제공되지 않았습니다. 운행 여부는 코레일·SRT 공식 사이트에서 확인해 주세요.');
      setRawItems(combined);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [dep, arr, date]);

  // 필터 적용 및 뱃지 계산
  useEffect(() => {
    let result = rawItems.filter(item => mode === 'all' || item.type === mode).map(item => ({ ...item, statusCode: undefined as BaseItem['statusCode'] }));
    
    // 상태값 계산 (지나간 표만 숨기기, 가짜 예약 상태 제거)
    const isToday = date === todayKST();
    const currentMins = realTime.getTime();
    
    result.forEach(item => {
      const [dh, dm] = item.dep.split(':').map(Number);
      const depMins = new Date(`${date}T${item.dep}:00+09:00`).getTime();
      {
        if (depMins <= currentMins) {
          item.statusCode = 'ended';
        } else if (depMins - currentMins <= 15 * 60000) {
          item.statusCode = 'urgent';
        }
      }
    });

    // 이미 시간이 지난 차는 아예 목록에서 제거
    result = result.filter(item => item.statusCode !== 'ended');

    // 시간대 필터 적용
    result = result.filter(item => {
      const depHour = parseInt(item.dep.split(':')[0], 10);
      return depHour >= startHour && depHour <= endHour;
    });

    if (result.length > 0) {
      let minDur = Infinity;
      let maxDur = -Infinity;
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      
      // 현재 목록의 최소/최대값 계산
      result.forEach(item => {
        const dur = diffMin(item.dep, item.arr);
        if (dur < minDur) minDur = dur;
        if (dur > maxDur) maxDur = dur;
        if (item.charge < minPrice) minPrice = item.charge;
        if (item.charge > maxPrice) maxPrice = item.charge;
      });

      // 시간이 전부 똑같거나, 요금이 전부 똑같으면 뱃지를 무의미하게 달지 않음
      const hasDurDiff = minDur !== maxDur;
      const hasPriceDiff = minPrice !== maxPrice;

      result.forEach(item => {
        const dur = diffMin(item.dep, item.arr);
        item.isFastest = hasDurDiff && (dur === minDur);
        item.isSlowest = hasDurDiff && (dur === maxDur);
        item.isCheapest = hasPriceDiff && (item.charge === minPrice);
        item.isMostExpensive = hasPriceDiff && (item.charge === maxPrice);
      });

      // 탭에 따른 필터 적용
      if (filter === 'cheap') result = result.filter(item => item.charge === minPrice);
      if (filter === 'fast') result = result.filter(item => item.isFastest);
      if (filter === 'expensive') result = result.filter(item => item.charge === maxPrice);
      if (filter === 'slow') result = result.filter(item => item.isSlowest);
    }
    setItems(result);
    setPage(p => Math.min(p, Math.max(1, Math.ceil(result.length / 10))));
    if (selected && new Date(`${date}T${selected.dep}:00+09:00`).getTime() <= realTime.getTime()) { setSelected(null); setStep(0); }
  }, [rawItems, mode, filter, date, realTime, startHour, endHour, selected]);
  useEffect(() => { setPage(1); setSelected(null); }, [mode, filter, date, startHour, endHour]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const bookingUrl = selected?.type === 'srt'
    ? 'https://etk.srail.kr/'
    : selected?.type === 'ktx' || selected?.type === 'itx'
    ? 'https://www.letskorail.com/'
    : 'https://www.kobus.co.kr/';

  return (
    <div className="site">
      <header className="header">
        <a className="brand" href="/" aria-label="하우웬고 처음으로">
          <span className="brand-icon"><Compass size={22} /></span>
          How When Go
        </a>
        <span className="demo-label"><span /> 스마트 시간표 검색</span>
      </header>

      <main className="layout">
        <aside className="intro">
          <div className="eyebrow"><span /> KTX vs 고속버스 통합 비교</div>
          <h1>기차 탈까? 버스 탈까?<br />한 번에 <span>비교하세요.</span></h1>
          <p>어떻게, 언제 갈까? 하우웬고에서<br />가성비와 속도를 비교하고<br />나에게 맞는 일정을 찾으세요.</p>
          <div className="route-art" aria-hidden="true">
            <div className="art-route"><span>SEOUL</span><span>DAEJEON</span></div>
            <div className="art-line"><i /><span><Compass size={30} /></span><i /></div>
            <div className="mini-ticket">
              <span className="mini-bell"><TrendingDown size={21} /></span>
              <div><b>가성비 최고 · 가장 빠름</b><small>AI 기반 뱃지 추천</small></div>
              <Check size={18} />
            </div>
          </div>
          <div className="intro-bottom"><ShieldCheck size={17} /> 공공데이터포털 API 실시간 통합 조회</div>
        </aside>

        <section className="app" aria-label="시간표 조회">
          <div className="app-top">
            <span>스마트 시간표 조회</span>
            <span className="step-count">0{step + 1}<span> / 03</span></span>
          </div>
          <div className="progress" aria-label={`${step + 1}단계 / 3단계`}>
            {[0, 1, 2].map(n => <span key={n} className={n <= step ? 'active' : ''} />)}
          </div>

          <div className="content">
            {step > 0 && (
              <button className="back" onClick={() => { setStep(0); setSelected(null); }}>
                <ArrowRight size={16} style={{ transform: 'rotate(180deg)' }} /> 다시 선택
              </button>
            )}

            {step === 0 && (
              <>
                <div className="title-row">
                  <div>
                    <div className="overline">어디로 가시나요?</div>
                    <h2 ref={heading} tabIndex={-1}>통합 시간표<br />조회하기</h2>
                  </div>
                  <span className="title-icon"><Compass size={27} /></span>
                </div>

                <div 
                  className="transport"
                  ref={transportScroll.ref}
                  onMouseDown={transportScroll.onMouseDown}
                  onMouseLeave={transportScroll.onMouseLeave}
                  onMouseUp={transportScroll.onMouseUp}
                  onMouseMove={transportScroll.onMouseMove}
                  aria-label="교통수단 메인 선택"
                >
                  <button className={`tab-all ${mode === 'all' ? 'chosen' : ''}`} onClick={() => setMode('all')}>
                    전체
                  </button>
                  {availableModes.has('ktx') && <button className={mode === 'ktx' ? 'chosen' : ''} onClick={() => setMode('ktx')}>
                    <TrainFront size={16} /> KTX
                  </button>}
                  {availableModes.has('srt') && <button className={mode === 'srt' ? 'chosen' : ''} onClick={() => setMode('srt')}>
                    <TrainFront size={16} /> SRT
                  </button>}
                  {availableModes.has('itx') && <button className={mode === 'itx' ? 'chosen' : ''} onClick={() => setMode('itx')}>
                    <TramFront size={16} /> 일반열차
                  </button>}
                  {availableModes.has('bus') && <button className={mode === 'bus' ? 'chosen' : ''} onClick={() => setMode('bus')}>
                    <BusFront size={16} /> 고속버스
                  </button>}
                </div>

                {/* 서브 필터 */}
                <div 
                  className="sub-filters"
                  aria-label="상세 필터"
                  ref={filterScroll.ref}
                  onMouseDown={filterScroll.onMouseDown}
                  onMouseLeave={filterScroll.onMouseLeave}
                  onMouseUp={filterScroll.onMouseUp}
                  onMouseMove={filterScroll.onMouseMove}
                >
                  <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                    기본 (전체)
                  </button>
                  <button className={filter === 'cheap' ? 'active cheap' : ''} onClick={() => setFilter('cheap')}>
                    <TrendingDown size={14} /> 최저가
                  </button>
                  <button className={filter === 'fast' ? 'active fast' : ''} onClick={() => setFilter('fast')}>
                    <Zap size={14} /> 최단시간
                  </button>
                  <button className={filter === 'expensive' ? 'active expensive' : ''} onClick={() => setFilter('expensive')}>
                    <TrendingUp size={14} /> 가장 비쌈
                  </button>
                  <button className={filter === 'slow' ? 'active slow' : ''} onClick={() => setFilter('slow')}>
                    <Clock size={14} /> 오래 걸림
                  </button>
                </div>

                <div className="route-card">
                  <div className="stations">
                    <div>
                      <small>출발 도시</small>
                      <select className="stn-select" value={dep} onChange={e => setDep(e.target.value)}>
                        {CITIES.filter(s => s !== arr).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <span className="route-arrow"><ArrowRight size={20} /></span>
                    <div style={{ textAlign: 'right' }}>
                      <small>도착 도시</small>
                      <select className="stn-select" value={arr} onChange={e => setArr(e.target.value)}>
                        {CITIES.filter(s => s !== dep).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="date">
                    <CalendarDays size={16} />
                    <select className="date-select" value={date} onChange={e => setDate(e.target.value)}>
                      {dateRange().map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                    </select>
                    <button className="refresh-btn" onClick={fetchData} aria-label="새로고침"><RefreshCw size={14} /></button>
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <button className="primary" disabled={!selected} onClick={() => setStep(1)} style={{ borderRadius: '14px', minHeight: '52px', boxShadow: '0 4px 12px rgba(26,111,212,0.15)' }}>
                    <ExternalLink size={18} /> {selected ? `${selected.dep} 출발편 예약 사이트로 이동` : '목록에서 표를 먼저 선택하세요'} <ArrowRight size={18} />
                  </button>
                </div>

                {/* 시간 필터 */}
                <div className="time-filter">
                  <Clock size={15} style={{ color: '#7090b8', marginRight: '4px' }} />
                  <select value={startHour} onChange={e => {
                    const val = Number(e.target.value);
                    setStartHour(val);
                    if (val > endHour) setEndHour(val);
                  }}>
                    {[...Array(25)].map((_, i) => <option key={`s-${i}`} value={i}>{i}시</option>)}
                  </select>
                  <span>~</span>
                  <select value={endHour} onChange={e => {
                    const val = Number(e.target.value);
                    setEndHour(val);
                    if (val < startHour) setStartHour(val);
                  }}>
                    {[...Array(25)].map((_, i) => <option key={`e-${i}`} value={i}>{i}시</option>)}
                  </select>
                </div>

                <div className="list-heading">
                  <h3>
                    {filter === 'cheap' && '가장 저렴한 편 (최저가)'}
                    {filter === 'fast' && '가장 빨리 도착하는 편 (최단시간)'}
                    {filter === 'expensive' && '가장 비싼 편'}
                    {filter === 'slow' && '가장 오래 걸리는 편'}
                    {filter === 'all' && `${dep} → ${arr}`}
                  </h3>
                  <span>{loading ? '조회 중…' : `${items.length}편`}</span>
                </div>
                {!loading && notice && <p className="hint" role="status">{notice}</p>}

                {(() => {
                  const PAGE_SIZE = 10;
                  const totalPages = Math.ceil(items.length / PAGE_SIZE);
                  const paginatedItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

                  return (
                    <>
                      {loading && (
                        <div className="loading-box">
                          <Loader2 size={28} className="spin" />
                          <p>실시간 데이터를 불러오고 있습니다…</p>
                        </div>
                      )}

                      {!loading && error && (
                        <div className="error-box"><TriangleAlert size={20} /><p>{error}</p></div>
                      )}

                      {!loading && !error && items.length === 0 && (
                        <div className="error-box"><TriangleAlert size={20} /><p>조건에 맞는 운행 편이 없습니다.</p></div>
                      )}

                      {!loading && items.length > 0 && (
                        <div className="trip-list">
                          {paginatedItems.map((item) => {
                      const isSel = selected?.id === item.id;
                      const dur = diffMin(item.dep, item.arr);
                      
                      return (
                        <button
                          key={item.id}
                          className={`trip${isSel ? ' selected' : ''}`}
                          aria-pressed={isSel}
                          onClick={() => setSelected(isSel ? null : item)}
                        >
                          <span className="radio">{isSel && <Check size={13} />}</span>
                          <span className="trip-main">
                            <span className="trip-times">
                              <b>{item.dep}</b><span className="short-line" /><span>{item.arr}</span>
                            </span>
                            <span className="trip-meta">
                              {item.type === 'bus' ? <BusFront size={12}/> : item.type === 'itx' ? <TramFront size={12}/> : <TrainFront size={12}/>}
                              {' '}
                              {item.type === 'bus' 
                                ? `고속버스 · ${(item as BusItem).grade}` 
                                : `${(item as TrainItem).grade || item.type.toUpperCase()} · 열차 ${(item as TrainItem).no}`}
                              <span>·</span>{fmtDur(dur)}
                              <span>· {item.depStation} → {item.arrStation}</span>
                            </span>
                            {(item.isFastest || item.isCheapest || item.isSlowest || item.isMostExpensive) && (
                              <div className="badges">
                                {item.isFastest && <span className="badge-item badge-fast"><Zap size={11}/> 가장 빠름</span>}
                                {item.isCheapest && <span className="badge-item badge-cheap"><TrendingDown size={11}/> 최저가</span>}
                                {item.isSlowest && <span className="badge-item badge-slow"><Clock size={11}/> 오래 걸림</span>}
                                {item.isMostExpensive && <span className="badge-item badge-expensive"><TrendingUp size={11}/> 가장 비쌈</span>}
                              </div>
                            )}
                          </span>
                          <div style={{ textAlign: 'right' }}>
                            <span className="charge-badge">
                              {item.charge.toLocaleString()}원
                            </span>
                            {item.statusCode === 'urgent' && <div className="status-pill status-urgent">출발임박 🔥</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                
                {totalPages > 1 && (
                  <div className="pagination">
                    {Array.from({length: totalPages}, (_, i) => i + 1).map(p => (
                      <button key={p} className={page === p ? 'active' : ''} onClick={() => setPage(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </>
            )}

            {step === 1 && selected && (
              <>
                <div className="title-row">
                  <div>
                    <div className="overline">선택한 {selected.type === 'bus' ? '버스' : '열차'}</div>
                    <h2 ref={heading} tabIndex={-1}>{selected.dep} 출발편을<br />선택했어요</h2>
                  </div>
                  <span className="title-icon">{selected.type === 'bus' ? <BusFront size={27} /> : selected.type === 'itx' ? <TramFront size={27} /> : <TrainFront size={27} />}</span>
                </div>
                <div className="waiting-ticket">
                  <div className="ticket-top">
                    <span>
                      {selected.type === 'bus' ? <BusFront size={19} /> : selected.type === 'itx' ? <TramFront size={19} /> : <TrainFront size={19} />}
                      {' '}
                      {selected.type === 'bus' 
                        ? `고속버스 · ${(selected as BusItem).grade}` 
                        : `${(selected as TrainItem).grade || selected.type.toUpperCase()} · 열차 ${(selected as TrainItem).no}`}
                    </span>
                  </div>
                  <div className="ticket-route">
                    <div><strong>{selected.depStation}</strong><b>{selected.dep}</b></div>
                    <div className="ticket-line"><span /><ArrowRight size={17} /></div>
                    <div><strong>{selected.arrStation}</strong><b>{selected.arr}</b></div>
                  </div>
                  <div className="ticket-bottom">
                    <span><CalendarDays size={15} /> {fmtDate(date)}</span>
                    <span>{selected.charge.toLocaleString()}원 · {fmtDur(diffMin(selected.dep, selected.arr))}</span>
                  </div>
                </div>
                <div className="waiting-message">
                  <span className="waiting-bell"><ExternalLink size={21} /></span>
                  <h3>공식 사이트에서 정확한 좌석 확인</h3>
                  <p>{selected.type === 'srt' ? 'SRT(에스알)' : selected.type === 'bus' ? '코버스' : '코레일'} 공식 사이트에서<br />직접 예약을 진행해 주세요.</p>
                  <div className="waiting-dots"><i /><i /><i /></div>
                </div>
              </>
            )}

            {step === 2 && selected && (
              <>
                <div className="title-row">
                  <div>
                    <div className="overline">예약 안내</div>
                    <h2 ref={heading} tabIndex={-1}>공식 사이트로<br />이동합니다</h2>
                  </div>
                  <span className="title-icon success"><Check size={30} /></span>
                </div>
                <div className="result" role="status">
                  <span className="result-tag">선택 완료</span>
                  <p>{selected.depStation} → {selected.arrStation}</p>
                  <strong>{selected.dep}<span>출발</span></strong>
                  <div><span className="pulse" />도착 {selected.arr} · {fmtDur(diffMin(selected.dep, selected.arr))} · {selected.charge.toLocaleString()}원</div>
                </div>
                <div className="result-note">
                  <ShieldCheck size={19} />
                  <p>
                    아래 버튼을 눌러 {selected.type === 'srt' ? 'SRT(에스알)' : selected.type === 'bus' ? '코버스' : '코레일'} 공식 사이트에서 예약하세요.<br />
                    <span>정확한 잔여석 현황은 공식 사이트에서 확인 가능합니다.</span>
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="actions">
            {step === 0 && null}
            {step === 1 && (
              <>
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="primary" onClick={() => setStep(2)}>
                  <ExternalLink size={18} /> {selected?.type === 'srt' ? 'SRT(에스알)' : selected?.type === 'bus' ? '코버스' : '코레일'} 예약 사이트로 이동 <ChevronRight size={18} />
                </a>
                <button className="secondary" onClick={() => setStep(0)}>다시 선택</button>
              </>
            )}
            {step === 2 && (
              <>
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="primary">
                  <ExternalLink size={18} /> {selected?.type === 'srt' ? 'SRT(에스알)' : selected?.type === 'bus' ? '코버스' : '코레일'} 공식 사이트 <ChevronRight size={18} />
                </a>
                <button className="secondary" onClick={() => { setStep(0); setSelected(null); }}>다른 편 보기</button>
              </>
            )}
            <div className="disclaimer">
              <ShieldCheck size={14} />
              <p>본 앱은 공공데이터포털 실시간 데이터를 제공하며, 최종 매진 여부 확인과 실제 예매는 각 공식 예약 사이트를 이용해 주세요.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
