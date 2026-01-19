const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');

/* ──────────────────────────────────────────────
   Telegram
─────────────────────────────────────────────── */

const token = '';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();

/* 병렬 키워드 개수 */
const KEYWORD_CONCURRENCY = 5;

let currentKwdIndex = 0;

/* ──────────────────────────────────────────────
   키워드 / 필터
─────────────────────────────────────────────── */

let myKeywords = [
    '바이젠셀','젠큐릭스','큐라클','압타바이오','퓨쳐켐','메지온','지아이이노베이션',
    '에이프릴바이오','큐리언트','티움바이오','엔케이맥스','파멥신','앱클론','오스코텍',
    '박셀바이오','지씨셀','셀리드','헬릭스미스','제넥신','유틸렉스','고바이오랩',
    '올리패스','올릭스','코오롱티슈진','디앤디파마텍','넥스트바이오메디컬','보로노이',
    '샤페론','브릿지바이오테라퓨틱스','에스씨엠생명과학','카이노스메드','이수앱지스',
    '안트로젠','아이진','펩트론','인벤티지랩'
];

let filterKeywords = [
    '승인','허가','특허','획득','FDA','NDA','샌드박스',
    'CSR','결과보고서','성공','L/O','계약','공시'
];

/* ──────────────────────────────────────────────
   Guide
─────────────────────────────────────────────── */

const guideMessage = `
📌 **바이오 뉴스 모니터링 봇 사용법**
• /on : 시작 | /off : 중지 | /list : 리스트
• /add 종목 | /del 종목
• /f_add 단어 | /f_del 단어
`;

/* ──────────────────────────────────────────────
   Base Scraper
─────────────────────────────────────────────── */

class BaseScraper {
    constructor(keyword) {
        this.keyword = keyword;
        this.encodedKeyword = encodeURIComponent(keyword);
    }

    async fetch(url) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 8000
            });
            return cheerio.load(res.data);
        } catch (e) {
            console.warn(`[fetch 실패] ${url} → ${e.message}`);
            return null;
        }
    }

    makeAbsoluteUrl(href, base) {
        if (!href) return '';
        if (href.startsWith('http')) return href;
        try { return new URL(href, base).href; }
        catch { return base + href; }
    }

    validate(title) {
        if (!title) return false;
        return title.toLowerCase().includes(this.keyword.toLowerCase());
    }

    isToday(dateText) {
        if (!dateText) return false;
        const now = moment();
        const todayStrs = [
            now.format('YYYY.MM.DD'), now.format('YYYY-MM-DD'),
            now.format('YYYYMMDD'), now.format('MM.DD'),
            now.format('HH시'), '시전','분전','시간전','오늘'
        ];
        return todayStrs.some(s => dateText.includes(s));
    }
}

/* ──────────────────────────────────────────────
   각 언론사 스크래퍼
─────────────────────────────────────────────── */

class TheBio extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.thebionews.net/news/articleList.html?sc_area=A&view_type=sm&sc_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('.titles a, .title a, .article-title a, li a').each((i, el) => {
            const $container = $(el).closest('.item, .list-item, li, .article');
            const date = $container.find('.date, .time, .published, small').first().text().trim();
            if (this.isToday(date)) list.push({ title: $(el).text().trim(), link: this.makeAbsoluteUrl($(el).attr('href'), 'https://www.thebionews.net') });
        });
        return list;
    }
}

class BioTimes extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.biotimes.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('.list-titles a, .title a, .subject a').each((i, el) => {
            const date = $(el).closest('.list-block, .item, li').find('.list-dated, .date, .regdate').first().text().trim();
            if (this.isToday(date)) list.push({ title: $(el).text().trim(), link: this.makeAbsoluteUrl($(el).attr('href'), 'http://www.biotimes.co.kr') });
        });
        return list;
    }
}

class PharmNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.pharmnews.com/news/articleList.html?sc_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('ul.type1 > li').each((i, el) => {
            const $a = $(el).find('h4.titles a').first();
            const date = $(el).find('em.info.dated').first().text().trim();
            if (this.isToday(date)) list.push({ title: $a.text().trim(), link: this.makeAbsoluteUrl($a.attr('href'), 'https://www.pharmnews.com') });
        });
        return list;
    }
}

class Yakup extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.yakup.com/search/index.html?csearch_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('ul li a, .news_item a, .list a').each((i, el) => {
            const date = $(el).closest('li').find('.date, .regdate, small, .time').last().text().trim();
            if (this.isToday(date)) list.push({ title: $(el).text().trim(), link: this.makeAbsoluteUrl($(el).attr('href'), 'https://www.yakup.com') });
        });
        return list;
    }
}

class DailyPharm extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.dailypharm.com/user/news/search?dropBarMode=search&searchOption=any&searchKeyword=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('ul.act_list_sty2 > li').each((i, el) => {
            const title = $(el).find('.lin_title').text().trim();
            const summary = $(el).find('.lin_cont').text().trim();
            let isRecent = true;
            const possibleDate = summary.match(/\d{4}-\d{2}-\d{2}/) || title.match(/\d{4}-\d{2}-\d{2}/);
            if (possibleDate) isRecent = this.isToday(possibleDate[0]);
            if (isRecent) list.push({ title, link: this.makeAbsoluteUrl($(el).find('a').attr('href'), 'https://www.dailypharm.com') });
        });
        return list;
    }
}

class MoneyToday extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.mt.co.kr/search?keyword=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('.article_item, .search-result-item, .news_list li').each((i, el) => {
            const title = $(el).find('h3, h4, .title, a strong').text().replace(/\s+/g, ' ').trim();
            const date = $(el).find('.date, .regdate, time, .byline').text().trim();
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl($(el).find('a').first().attr('href'), 'https://www.mt.co.kr') });
        });
        return list;
    }
}

class HitNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.hitnews.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('ul.type1 > li').each((i, el) => {
            const $a = $(el).find('h4.titles a, h3.titles a, .titles a').first();
            const date = $(el).find('em.info.dated, .dated, .date, .regdate').first().text().trim();
            if (this.isToday(date)) list.push({ title: $a.text().trim(), link: this.makeAbsoluteUrl($a.attr('href'), 'http://www.hitnews.co.kr') });
        });
        return list;
    }
}

class MediPharmToday extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.pharmstoday.com/news/articleList.html?sc_area=A&view_type=sm&sc_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('.titles a, .title a, .article-title a, .subject a, li a').each((i, el) => {
            const date = $(el).closest('.item, .list-item, li, .news-row, .article').find('.date, .regdate, time, .published').first().text().trim();
            if (this.isToday(date)) list.push({ title: $(el).text().trim(), link: this.makeAbsoluteUrl($(el).attr('href'), 'https://www.pharmstoday.com') });
        });
        return list;
    }
}

class MedicalNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.bosa.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        if (!$) return [];
        const list = [];
        $('.titles a, .title a, .subject a, .list-title a, .news a').each((i, el) => {
            const date = $(el).closest('.item, li, .article-list-item, .news-item').find('.date, .regdate, .wdate, time, .published').first().text().trim();
            if (this.isToday(date)) list.push({ title: $(el).text().replace(/\s+/g, ' ').trim(), link: this.makeAbsoluteUrl($(el).attr('href'), 'http://www.bosa.co.kr') });
        });
        return list;
    }
}

const scrapersMap = {
    '더바이오': TheBio,
    '바이오타임즈': BioTimes,
    '팜뉴스': PharmNews,
    '약업닷컴': Yakup,
    '데일리팜': DailyPharm,
    '히트뉴스': HitNews,
    '메디팜스투데이': MediPharmToday,
    '의학신문': MedicalNews,
    '머니투데이': MoneyToday
};

/* ──────────────────────────────────────────────
   모니터링 (키워드 병렬 + 언론사 병렬)
─────────────────────────────────────────────── */

async function scanOneKeyword(keyword, chatId) {
    const scanPromises = Object.entries(scrapersMap).map(
        async ([name, Scraper]) => {
            try {
                const scraper = new Scraper(keyword);
                const items = await scraper.getNewsList();
                return { name, items, scraper };
            } catch {
                return { name, items: [], scraper: null };
            }
        }
    );
    const results = await Promise.all(scanPromises);

    for (const { name, items, scraper } of results) {
        for (const item of items) {
            if (!scraper || !scraper.validate(item.title)) continue;
            if (filterKeywords.length && !filterKeywords.some(f => item.title.includes(f))) continue;

            const key = `${name}_${item.title}`;
            if (compare_map.has(key)) continue;
            compare_map.set(key, true);

            await bot.sendMessage(
                chatId,
                `[${moment().format('HH:mm')}] [${name}] **${item.title}**\n${item.link}`,
                { parse_mode: 'Markdown', disable_web_page_preview: false }
            );
        }
    }
}

async function runMonitoring(chatId) {
    if (!check) return;

    const batch = [];
    for (let i = 0; i < KEYWORD_CONCURRENCY; i++) {
        const kw = myKeywords[currentKwdIndex];
        batch.push(kw);
        currentKwdIndex = (currentKwdIndex + 1) % myKeywords.length;
    }

    await Promise.all(batch.map(keyword => scanOneKeyword(keyword, chatId)));

    playAlert = setTimeout(() => runMonitoring(chatId), 5000);
}

/* ──────────────────────────────────────────────
   명령어 처리
─────────────────────────────────────────────── */

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (text === '/start' || text === '/help') {
        bot.sendMessage(chatId, guideMessage, { parse_mode: 'Markdown' });
    } else if (text === '/on') {
        if (!check) {
            check = true;
            compare_map.clear();
            bot.sendMessage(chatId, "🚀 모니터링 시작");
            runMonitoring(chatId);
        }
    } else if (text === '/off') {
        check = false;
        clearTimeout(playAlert);
        bot.sendMessage(chatId, "🛑 모니터링 중지");
    } else if (text === '/list') {
        bot.sendMessage(
            chatId,
            `📋 **종목:** ${myKeywords.join(', ')}\n🔍 **필터:** ${filterKeywords.join(', ')}`,
            { parse_mode: 'Markdown' }
        );
    } else if (text.startsWith('/add ')) {
        const k = text.replace('/add ', '').trim();
        if (k) { myKeywords = [...new Set([...myKeywords, k])]; bot.sendMessage(chatId, `✅ 추가됨: ${k}`); }
    } else if (text.startsWith('/del ')) {
        const k = text.replace('/del ', '').trim();
        myKeywords = myKeywords.filter(v => v !== k);
        bot.sendMessage(chatId, `🗑️ 삭제됨: ${k}`);
    } else if (text.startsWith('/f_add ')) {
        const f = text.replace('/f_add ', '').trim();
        if (f) { filterKeywords = [...new Set([...filterKeywords, f])]; bot.sendMessage(chatId, `🔍 필터 추가: ${f}`); }
    } else if (text.startsWith('/f_del ')) {
        const f = text.replace('/f_del ', '').trim();
        filterKeywords = filterKeywords.filter(v => v !== f);
        bot.sendMessage(chatId, `🗑️ 필터 삭제: ${f}`);
    }
});

console.log("🚀 바이오 뉴스 봇 (키워드 병렬 + 언론사 병렬) 가동 중...");
