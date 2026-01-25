const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');
const https = require('https');
const { performance } = require('perf_hooks');
const constants = require('constants');

// --- 1. 기본 설정 ---
const token = '8580951991:AAGVAlC_sjm7g8vYBlU1yaD4NL0EZ1MwHbg';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();

const axiosConfig = {
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    httpsAgent: new https.Agent({ 
        rejectUnauthorized: false,
        secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
        ciphers: 'DEFAULT@SECLEVEL=1' 
    })
};

// --- 2. 키워드 및 패턴 설정 ---
const myKeywords = ['큐리오시스', '바이젠셀', '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', '지아이이노베이션', '에이프릴바이오', '큐리언트', '티움바이오', '앱클론', 
                    '오스코텍', '박셀바이오', '지씨셀', '셀리드', '제넥신', '유틸렉스', '고바이오랩', '올릭스', '코오롱티슈진', '디앤디파마텍', '넥스트바이오메디컬', '보로노이', '샤페론', 
                    '브릿지바이오테라퓨틱스', '에스씨엠생명과학', '카이노스메드', '이수앱지스', '안트로젠', '아이진', '펩트론', '인벤티지랩', '코아스템켐온', '큐로셀', '바이오다인', '메드팩토', 
                    '와이바이오로직스', '에이비온', '지노믹트리', '파로스아이바이오', '신테카바이오', '에스엘바이오닉스', '에이비엘바이오', '지투지바이오', '나이벡', '레고켐바이오'];

const goodNewsPattern = new RegExp("(\\[속보\\]|\\[특징주\\]|CSR|톱라인|Top-line|FDA|승인|허가|CSR|획득|NDA|임상\\s*[1-3]상|결과\\s*보고서|성공|L/O|기술\\s*수출|계약|공시)", "i");
const badNewsPattern = new RegExp("(검찰\\s*조사|횡령|배임|상장\\s*폐지|관리\\s*종목|임상\\s*중단|실패|반려|부적격|불성실|허위|조작)", "i");

const rssMap = {
    '연합뉴스': 'https://www.yna.co.kr/rss/news.xml',
    '히트뉴스': 'https://www.hitnews.co.kr/rss/allArticle.xml',
    '의학신문': 'http://www.bosa.co.kr/rss/S1N1.xml',
    '이데일리': 'https://news.google.com/rss/search?q=site:edaily.co.kr+%EB%B0%94%EC%9D%B4%EC%98%A4&hl=ko&gl=KR&ceid=KR:ko'
};

const scrapMap = {
    '데일리팜': { 
        url: 'https://www.dailypharm.com/user/news?group=%EC%A0%9C%EC%95%BD%C2%B7%EB%B0%94%EC%9D%B4%EC%98%A4', 
        selector: 'ul.act_list_sty1 li', 
        titleSub: '.lin_title', 
        linkSub: 'a' 
    },
    '약업닷컴': { 
        url: 'https://www.yakup.com/news/index.html?cat=12&cat2=121', 
        selector: '.info_con > ul > li',
        titleSub: '.title_con span',
        linkSub: 'a',
        baseUrl: 'https://www.yakup.com'
    },
    '팜뉴스': { 
        url: 'https://www.pharmnews.com/news/articleList.html?view_type=sm', 
        selector: '.list-block', 
        titleSub: '.list-titles a', 
        linkSub: '.list-titles a', 
        baseUrl: 'https://www.pharmnews.com' 
    }
};

// --- 3. 핵심 로직 ---

async function runRssMonitoring(chatId) {
    if (!check) return;
    const logTime = () => moment().format('HH:mm:ss');
    const totalStartTime = performance.now();
    let speedResults = [];

    console.log(`\n\x1b[36m--- [${logTime()}] 뉴스 스캔 시작 ---\x1b[0m`);

    // (A) RSS 수집
    const rssTasks = Object.entries(rssMap).map(async ([site, url]) => {
        const start = performance.now();
        try {
            const res = await axios.get(url, axiosConfig);
            const $ = cheerio.load(res.data, { xmlMode: true });
            const items = [];
            $('item').each((i, el) => {
                if (i > 15) return;
                const title = $(el).find('title').text().trim();
                const link = $(el).find('link').text().trim();
                if (title) items.push({ title, link, site });
            });
            speedResults.push({ site, time: (performance.now() - start).toFixed(0), count: items.length });
            return items;
        } catch (e) { speedResults.push({ site, time: "FAIL", count: 0 }); return []; }
    });

    // (B) 스크래핑 수집
    const scrapTasks = Object.entries(scrapMap).map(async ([site, cfg]) => {
        const start = performance.now();
        try {
            const res = await axios.get(cfg.url, axiosConfig);
            const $ = cheerio.load(res.data);
            const items = [];
            $(cfg.selector).each((i, el) => {
                if (i > 15) return;
                let title = $(el).find(cfg.titleSub).text().replace(/\s+/g, ' ').trim();
                let link = $(el).find(cfg.linkSub).attr('href');
                if (link && !link.startsWith('http')) link = (cfg.baseUrl || new URL(cfg.url).origin) + link;
                if (title && title.length > 5) items.push({ title, link, site });
            });
            speedResults.push({ site, time: (performance.now() - start).toFixed(0), count: items.length });
            return items;
        } catch (e) { speedResults.push({ site, time: "FAIL", count: 0 }); return []; }
    });

    // (C) 머니투데이 API 수집
    const mtApiTask = (async () => {
        const start = performance.now();
        try {
            const res = await axios.get('https://www.mt.co.kr/api/hits/realtime?limit=50', axiosConfig);
            const items = res.data.data.item.map(article => ({
                title: article.title,
                link: article.article_url,
                site: '머니투데이'
            }));
            speedResults.push({ site: '머니투데이', time: (performance.now() - start).toFixed(0), count: items.length });
            return items;
        } catch (e) { speedResults.push({ site: '머니투데이', time: "FAIL", count: 0 }); return []; }
    })();

    const allResults = await Promise.all([...rssTasks, ...scrapTasks, mtApiTask]);
    const flatNews = allResults.flat();

    // --- 기사별 상세 로그 출력 ---
    flatNews.forEach(news => {
        const matchedKeyword = myKeywords.find(keyword => news.title.includes(keyword));
        const isGood = goodNewsPattern.test(news.title);
        const isBad = badNewsPattern.test(news.title);
        const timeStr = moment().format('HH:mm:ss');

        if (matchedKeyword) {
            const uniqueKey = `${news.site}_${news.title}`;
            
            if (isGood && !isBad && !compare_map.has(uniqueKey)) {
                // [전송] 초록색
                compare_map.set(uniqueKey, true);
                bot.sendMessage(chatId, `🔔 **바이오 속보 매칭**\n\n📌 #${matchedKeyword}\n📰 ${news.site}\n📝 ${news.title}\n\n🔗 [기사보기](${news.link})`, { parse_mode: 'Markdown' });
                console.log(`\x1b[32m[전송][${timeStr}][${news.site}][${matchedKeyword}] ${news.title}\x1b[0m`);
            } else {
                // [제외] 노란색
                let reason = "패턴미달";
                if (compare_map.has(uniqueKey)) reason = "중복";
                else if (isBad) reason = "악재패턴";
                console.log(`\x1b[33m[제외(${reason})][${timeStr}][${news.site}][${matchedKeyword}] ${news.title}\x1b[0m`);
            }
        }
    });

    // --- 매체 응답 리포트 ---
    console.log(`\n⏱️  매체 응답 리포트:`);
    const sorted = speedResults.sort((a, b) => (a.time === "FAIL" ? 1 : b.time === "FAIL" ? -1 : a.time - b.time));
    console.log(sorted.map(s => `${s.time === "FAIL" ? "❌" : "✅"} ${s.site}(${s.count}건/${s.time}ms)`).join(' | '));
    console.log(`\x1b[36m--- 스캔 완료 (총 ${flatNews.length}건 / 소요: ${((performance.now() - totalStartTime)/1000).toFixed(2)}초) ---\x1b[0m`);

    if (compare_map.size > 5000) compare_map.clear();
    if (check) playAlert = setTimeout(() => runRssMonitoring(chatId), 20000);
}

// --- 4. 텔레그램 명령어 처리 ---
bot.on('message', (msg) => {
    if (msg.text === '/on' && !check) {
        check = true;
        bot.sendMessage(msg.chat.id, "🚀 실시간 바이오 뉴스 모니터링 가동");
        runRssMonitoring(msg.chat.id);
    } else if (msg.text === '/off') {
        check = false;
        clearTimeout(playAlert);
        bot.sendMessage(msg.chat.id, "🛑 모니터링 중지");
    }
});

console.log("✅ 시스템 준비 완료. /on으로 시작하세요.");