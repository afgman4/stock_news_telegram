const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');
const https = require('https');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

const token = '';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let isTestMode = false; // 테스트 모드 여부
let playAlert = null;
let compare_map = new Map();
let daily_keyword_map = new Set();
let last_reset_date = moment().format('YYYYMMDD');

// --- 설정: 작동 시간 (8시 ~ 20시) ---
const START_HOUR = 8;
const END_HOUR = 20;

const myKeywords = ['바이젠셀', '코아스템켐온', '비피도', '큐리오시스', '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', '지아이이노베이션', '에이프릴바이오', '큐리언트', 
                    '티움바이오', '앱클론', '오스코텍', '박셀바이오', '지씨셀', '셀리드', '제넥신', '유틸렉스', '고바이오랩', '올릭스', '코오롱티슈진', '디앤디파마텍', '보로노이', 
                    '샤페론', '브릿지바이오테라퓨틱스', '에스씨엠생명과학', '카이노스메드', '이수앱지스', '안트로젠', '아이진', '펩트론', '인벤티지랩', '큐로셀', '바이오다인', '메드팩토', 
                    '와이바이오로직스', '에이비온', '지노믹트리', '파로스아이바이오', '신테카바이오', '에스엘바이오닉스', '에이비엘바이오', '지투지바이오', '나이벡', '레고켐바이오', '에스티팜',
                    '디앤디파마텍','에임드바이오','오름테라퓨틱','에이프릴바이오'];

// 호재 패턴: '결과보고서', '유의성 확보', '지표 달성' 등 긍정 문구 강화
const goodNewsPattern = new RegExp("(CSR|톱라인|Top-line|FDA|승인|허가|심사.*?(통과|승인)|획득|NDA|임상\\s*[1-3]상|결과보고서|성공|L/O|기술\\s*수출|계약|공급|체결|통계적\\s*유의성|유의성\\s*확보|지표\\s*달성|만장일치|확보|)", "i");

// 악재 패턴: '미달성', '확보 실패', '유의성 미확보' 등 부정 문구 강화
const badNewsPattern = new RegExp("(검찰\\s*조사|횡령|배임|채용|상장\\s*폐지|관리\\s*종목|임상\\s*중단|실패|반려|부적격|불성실|허위|조작|실패|미달성|확보\\s*실패|유의성\\s*미확보|유의성\\s*결여|결과보고서\\s*미달성|철회)", "i");

// 본문 호재 패턴
const bodyGoodNewsPattern = new RegExp("(승인|만장일치|체결|확보|)", "i");

const getAxiosConfig = () => ({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    httpsAgent: new https.Agent({ rejectUnauthorized: false, secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT })
});

const escapeHTML = (str) => str ? str.replace(/[&<>]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[tag] || tag)) : "";

const rssMap = { '연합뉴스': 'https://www.yna.co.kr/rss/news.xml', '히트뉴스': 'https://www.hitnews.co.kr/rss/allArticle.xml' };
const scrapMap = {
    '이데일리': { url: 'https://www.edaily.co.kr/News/realtimenews?tab=0', selector: '.news_list dl', titleSub: 'dd a span', linkSub: 'dd a', isEdaily: true },
    '데일리팜': { url: 'https://www.dailypharm.com/user/news?group=%EC%A0%9C%EC%95%BD%C2%B7%EB%B0%94%EC%9D%B4%EC%98%A4', selector: 'ul.act_list_sty1 li', titleSub: '.lin_title', linkSub: 'a' },
    '약업닷컴': { url: 'https://www.yakup.com/news/index.html?cat=12&cat2=121', selector: '.info_con > ul > li', titleSub: '.title_con span', linkSub: 'a', baseUrl: 'https://www.yakup.com' }
};

async function runMonitoring(chatId) {
    if (!check) return;
const now = moment();
    const currentHour = now.hour();
    const logTime = () => now.format('HH:mm:ss');
    const today = now.format('YYYYMMDD');


    // --- [시간 제한 로직] 테스트 모드가 아닐 때만 작동 ---
    if (!isTestMode && (currentHour < START_HOUR || currentHour >= END_HOUR)) {
        console.log(`[${logTime()}] 😴 휴식 시간 (테스트 모드 아님). 10분 후 재확인.`);
        playAlert = setTimeout(() => runMonitoring(chatId), 10 * 60 * 1000);
        return;
    }

    if (last_reset_date !== today) {
        daily_keyword_map.clear();
        compare_map.clear();
        last_reset_date = today;
    }

    console.log(`[${logTime()}] 🔍 뉴스 검색 시작...`);

    let fetchTasks = [
        ...Object.entries(rssMap).map(async ([site, url]) => {
            try {
                const res = await axios.get(url, getAxiosConfig());
                const $ = cheerio.load(res.data, { xmlMode: true });
                return $('item').map((i, el) => ({ title: $(el).find('title').text().trim(), link: $(el).find('link').text().trim(), site, time: logTime() })).get().slice(0, 15);
            } catch (e) { return []; }
        }),
        ...Object.entries(scrapMap).map(async ([site, cfg]) => {
            try {
                const res = await axios.get(cfg.url, getAxiosConfig());
                const $ = cheerio.load(res.data);
                return $(cfg.selector).map((i, el) => {
                    let title = $(el).find(cfg.titleSub).text().replace(/\s+/g, ' ').trim();
                    let link = $(el).find(cfg.linkSub).attr('href');
                    if (cfg.isEdaily && link) {
                        const match = link.match(/'(\d+)'/);
                        if (match) link = `https://www.edaily.co.kr/news/read?newsId=${match[1]}`;
                    } else if (link && !link.startsWith('http')) { link = (cfg.baseUrl || new URL(cfg.url).origin) + link; }
                    return title && title.length > 5 ? { title, link, site, time: logTime() } : null;
                }).get().filter(n => n).slice(0, 15);
            } catch (e) { return []; }
        })
    ];

    const allNews = (await Promise.all(fetchTasks)).flat();

    // --- 핵심 모니터링 로직 수정 부분 ---
    for (const news of allNews) {
        let matchedKeyword = myKeywords.find(k => news.title.includes(k));
        if (!matchedKeyword) continue;
        if (daily_keyword_map.has(matchedKeyword)) continue; 

        const uniqueKey = `${news.site}_${news.title}`;
        if (compare_map.has(uniqueKey)) continue;

        // [1단계] 제목에서 즉시 패턴 확인
        let goodMatch = news.title.match(goodNewsPattern);
        let badMatch = news.title.match(badNewsPattern);

        // [2단계] 바이젠셀 특수 로직: 제목에 악재 있으면 즉시 전송 후 다음 기사로 skip
        if (matchedKeyword === '바이젠셀' && badMatch) {
            sendAlert(chatId, news, matchedKeyword, null, badMatch, "🚨 제목 악재 포착");
            continue; // 본문 스캔 필요 없음
        }

        // [3단계] 일반 종목 로직: 제목에 악재가 있으면 호재고 뭐고 즉시 제외 (본문 볼 필요 없음)
        if (badMatch) {
            console.log(`\x1b[33m[제외][제목악재][${matchedKeyword}] ${news.title.substring(0, 30)}...\x1b[0m`);
            continue; 
        }

        // [4단계] 본문 정밀 스캔 (제목에 호재가 없거나, 더 구체적인 문맥을 찾고 싶을 때)
        let contextText = "";
        if (!goodMatch && news.link && news.link.startsWith('http')) {
            try {
                await new Promise(r => setTimeout(r, 600)); 
                const detailRes = await axios.get(news.link, getAxiosConfig());
                const $detail = cheerio.load(detailRes.data);
                const bodyText = $detail('.contents_con, article, .article_body, #newsEndContents, #dic_area, .at-content, #newsct_article').text().replace(/\s+/g, ' ').trim();

                // 1. 본문 악재 체크 (바이젠셀이 아닐 경우 더 엄격하게 체크)
                const bodyBadMatch = bodyText.match(badNewsPattern);
                
                // [수정] 제목이 이미 강력한 호재(승인, 만장일치 등)인 경우 본문의 사소한 단어로 제외하지 않음
                if (bodyBadMatch && !news.title.match(bodyGoodNewsPattern)) {
                    if (matchedKeyword === '바이젠셀') {
                        sendAlert(chatId, news, matchedKeyword, null, bodyBadMatch, bodyText);
                    } else {
                        console.log(`\x1b[33m[제외][본문악재][${matchedKeyword}] ${news.title.substring(0, 30)}...\x1b[0m`);
                    }
                    continue;
                }

                // 2. 본문 호재 탐색
                if (!goodMatch) {
                    goodMatch = bodyText.match(goodNewsPattern);
                    if (goodMatch) {
                        const idx = bodyText.indexOf(goodMatch[0]);
                        contextText = "..." + bodyText.substring(Math.max(0, idx - 45), idx + 55).trim() + "...";
                    }
                }
            } catch (e) { }
        }

        // [5단계] 최종 전송 판단
        if (goodMatch) {
            sendAlert(chatId, news, matchedKeyword, goodMatch, null, contextText);
        }
    }

    // --- 중복 메시지 전송 함수화 ---
    function sendAlert(chatId, news, keyword, goodMatch, badMatch, context) {
        const uniqueKey = `${news.site}_${news.title}`;
        compare_map.set(uniqueKey, true);
        daily_keyword_map.add(keyword);

        let msg = "";
        if (badMatch) {
            msg = `⚠️🚨🆘 <b>${keyword} 위험 감지</b> 🆘🚨⚠️\n\n` +
                `🚨 <b>위험 상황:</b> #${escapeHTML(keyword)}\n` +
                `❌ <b>악재 단어:</b> #${escapeHTML(badMatch[0])}\n`;
        } else {
            msg = `🔔 <b>바이오 호재 탐지</b>\n\n` +
                `📌 <b>종목:</b> #${escapeHTML(keyword)}\n` +
                `🎯 <b>탐지단어:</b> #${escapeHTML(goodMatch[0])}\n`;
        }

        if (context && context.length > 10) msg += `📝 <b>내용확인:</b> <code>${escapeHTML(context)}</code>\n\n`;
        msg += `📰 <b>매체:</b> ${news.site} | ⌚ <b>시간:</b> ${news.time}\n` +
            `📝 <b>제목:</b> ${escapeHTML(news.title)}\n\n` +
            `🔗 <b>기사링크:</b> ${news.link}`;

        bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        const color = badMatch ? "\x1b[31m" : "\x1b[32m";
        console.log(`${color}[전송][${badMatch ? '악재' : '호재'}][${keyword}] ${news.title}\x1b[0m`);
    }
    if (check) playAlert = setTimeout(() => runMonitoring(chatId), 4000 + Math.random() * 1000);
}

bot.onText(/\/on/, (msg) => {
    check = true;
    isTestMode = false; // 일반 모드
    bot.sendMessage(msg.chat.id, `🚀 <b>일반 분석 가동</b>\n⌚ 작동시간: ${START_HOUR}시 ~ ${END_HOUR}시`);
    runMonitoring(msg.chat.id);
});

bot.onText(/\/test/, (msg) => {
    check = true;
    isTestMode = true; // 테스트 모드 (시간 무시)
    bot.sendMessage(msg.chat.id, `🧪 <b>테스트 모드 가동</b>\n⌚ 시간 제한 없이 즉시 분석합니다.`);
    runMonitoring(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    check = false;
    isTestMode = false;
    clearTimeout(playAlert);
    bot.sendMessage(msg.chat.id, "🛑 <b>모니터링 중지</b>");
});

bot.onText(/\/help/, (msg) => {
    let helpMsg = `📖 <b>바이오 속보 모니터링 봇 사용 가이드</b>\n\n`;
    
    helpMsg += `✅ <b>기본 명령어</b>\n`;
    helpMsg += `🚀 /on : 일반 가동 (08:00~20:00 작동)\n`;
    helpMsg += `🧪 /test : 테스트 모드 (시간 무관 즉시 작동)\n`;
    helpMsg += `🛑 /off : 모니터링 즉시 중지\n\n`;

    helpMsg += `🔍 <b>감시 매체</b>\n`;
    helpMsg += `연합뉴스, 이데일리, 데일리팜, 히트뉴스, 약업닷컴 등\n\n`;

    helpMsg += `💡 <b>주요 필터링 원리</b>\n`;
    helpMsg += `1️⃣ <b>제목 우선:</b> 제목에 악재 단어 포함 시 즉시 제외\n`;
    helpMsg += `2️⃣ <b>본문 정밀:</b> 모호한 뉴스도 본문 분석 후 호재 탐지\n`;
    helpMsg += `3️⃣ <b>강력 호재:</b> [승인/만장일치/체결] 등은 오탐지 방어 작동\n`;
    helpMsg += `4️⃣ <b>집중 감시:</b> '바이젠셀'은 악재 시 즉시 긴급 알림\n\n`;

    helpMsg += `⚠️ <i>매일 자정 중복 방지 데이터가 초기화됩니다.</i>`;

    bot.sendMessage(msg.chat.id, helpMsg, { parse_mode: 'HTML' });
});
