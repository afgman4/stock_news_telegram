const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');
const https = require('https');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

const token = '8580951991:AAGVAlC_sjm7g8vYBlU1yaD4NL0EZ1MwHbg';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();
let daily_keyword_map = new Set();
let last_reset_date = moment().format('YYYYMMDD');

const myKeywords = ['코아스템켐온', '비피도', '큐리오시스', '바이젠셀', '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', '지아이이노베이션', '에이프릴바이오', '큐리언트', '티움바이오', '앱클론', '오스코텍', '박셀바이오', '지씨셀', '셀리드', '제넥신', '유틸렉스', '고바이오랩', '올릭스', '코오롱티슈진', '디앤디파마텍', '보로노이', '샤페론', '브릿지바이오테라퓨틱스', '에스씨엠생명과학', '카이노스메드', '이수앱지스', '안트로젠', '아이진', '펩트론', '인벤티지랩', '큐로셀', '바이오다인', '메드팩토', '와이바이오로직스', '에이비온', '지노믹트리', '파로스아이바이오', '신테카바이오', '에스엘바이오닉스', '에이비엘바이오', '지투지바이오', '나이벡', '레고켐바이오', '에스티팜'];

// 패턴 보강: '통과', '선정', '승인' 등을 아주 유연하게 매칭 (.* 사용)
const goodNewsPattern = new RegExp("(CSR|톱라인|Top-line|FDA|CSR|승인|허가|심사.*?(통과|승인)|선정|획득|NDA|임상.*?상|성공|L/O|기술.*?수출|계약|공급|체결)", "i");
const badNewsPattern = new RegExp("(검찰|횡령|배임|상장.*?폐지|관리.*?종목|임상.*?중단|채용|실패|반려|부적격|불성실|허위|조작|철회)", "i");

const getAxiosConfig = () => ({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    httpsAgent: new https.Agent({ rejectUnauthorized: false, secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT })
});

const formatMtTime = (dtStr) => {
    if (!dtStr || dtStr.length < 14) return moment().format('HH:mm:ss');
    return `${dtStr.substring(8, 10)}:${dtStr.substring(10, 12)}:${dtStr.substring(12, 14)}`;
};

const escapeHTML = (str) => str ? str.replace(/[&<>]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[tag] || tag)) : "";

const rssMap = { '연합뉴스': 'https://www.yna.co.kr/rss/news.xml', '히트뉴스': 'https://www.hitnews.co.kr/rss/allArticle.xml' };
const scrapMap = {
    '이데일리': { url: 'https://www.edaily.co.kr/News/realtimenews?tab=0', selector: '.news_list dl', titleSub: 'dd a span', linkSub: 'dd a', isEdaily: true },
    '데일리팜': { url: 'https://www.dailypharm.com/user/news?group=%EC%A0%9C%EC%95%BD%C2%B7%EB%B0%94%EC%9D%B4%EC%98%A4', selector: 'ul.act_list_sty1 li', titleSub: '.lin_title', linkSub: 'a' },
    '약업닷컴': { url: 'https://www.yakup.com/news/index.html?cat=12&cat2=121', selector: '.info_con > ul > li', titleSub: '.title_con span', linkSub: 'a', baseUrl: 'https://www.yakup.com' }
};

async function runMonitoring(chatId) {
    if (!check) return;
    const logTime = () => moment().format('HH:mm:ss');
    const today = moment().format('YYYYMMDD');

    if (last_reset_date !== today) {
        daily_keyword_map.clear();
        compare_map.clear();
        last_reset_date = today;
    }

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
        }),
        (async () => {
            try {
                const res = await axios.get('https://www.mt.co.kr/api/hits/realtime?limit=15', getAxiosConfig());
                return res.data.data.item.map(a => ({ title: a.title, link: a.article_url, site: '머니투데이', time: formatMtTime(a.display_dt) }));
            } catch (e) { return []; }
        })()
    ];

    const allNews = (await Promise.all(fetchTasks)).flat();

    for (const news of allNews) {
        let matchedKeyword = myKeywords.find(k => news.title.includes(k));
        
        if (!matchedKeyword) continue;
        if (daily_keyword_map.has(matchedKeyword)) continue; 

        const uniqueKey = `${news.site}_${news.title}`;
        if (compare_map.has(uniqueKey)) continue;

        let goodMatch = news.title.match(goodNewsPattern);
        let foundSource = "제목";
        let contextText = "";

        // 제목에 없으면 본문/부제목 스캔
        if (news.link && news.link.startsWith('http')) {
            try {
                console.log(`\x1b[90m[분석중] ${news.site} - ${matchedKeyword} ${news.title} ${news.link}\x1b[0m`);
                await new Promise(r => setTimeout(r, 600)); 
                const detailRes = await axios.get(news.link, getAxiosConfig());
                const $detail = cheerio.load(detailRes.data);
                
                // 약업닷컴 부제목(text02_con) 및 본문 전체 포함
                const bodyText = $detail('.contents_con, article, .article_body, #newsEndContents, #dic_area, .at-content, #newsct_article')
                    .text().replace(/\s+/g, ' ').trim();

                let bodyGoodMatch = bodyText.match(goodNewsPattern);
                
                if (bodyGoodMatch) {
                    goodMatch = bodyGoodMatch;
                    foundSource = "본문/부제목";
                    const idx = bodyText.indexOf(goodMatch[0]);
                    contextText = "..." + bodyText.substring(Math.max(0, idx - 45), idx + 55).trim() + "...";
                }
            } catch (e) { }
        }

        if (goodMatch && !badNewsPattern.test(news.title)) {
            compare_map.set(uniqueKey, true);
            daily_keyword_map.add(matchedKeyword); 

            let msg = `🔔 <b>초정밀 탐지 성공 (${foundSource})</b>\n\n`;
            msg += `📌 <b>종목:</b> #${escapeHTML(matchedKeyword)}\n`;
            msg += `🎯 <b>탐지단어:</b> #${escapeHTML(goodMatch[0])}\n`;
            if (contextText) msg += `📝 <b>매칭문맥:</b> <code>${escapeHTML(contextText)}</code>\n\n`;
            msg += `📰 <b>매체:</b> ${news.site}\n`;
            msg += `⌚ <b>시간:</b> ${news.time}\n`;
            msg += `📝 <b>제목:</b> ${escapeHTML(news.title)}\n\n`;
            msg += `🔗 <b>기사원문:</b> ${news.link}`;

            bot.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: false });
            console.log(`\x1b[1m\x1b[32m[전송][${foundSource}][${matchedKeyword}] ${news.title}\x1b[0m`);
        }
    }
    if (check) playAlert = setTimeout(() => runMonitoring(chatId), 4000 + Math.random() * 1000);
}

bot.onText(/\/on/, (msg) => {
    check = true;
    bot.sendMessage(msg.chat.id, "🚀 <b>약업닷컴 정밀 스캔 가동</b>");
    runMonitoring(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    check = false;
    clearTimeout(playAlert);
    bot.sendMessage(msg.chat.id, "🛑 <b>중지</b>");
});