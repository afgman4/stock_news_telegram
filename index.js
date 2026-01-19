const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');
const dns = require('dns');

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const token = '8483984900:AAH3mF9GKrXb8s8k7DefCfke7Xw6J9FzpDs'
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();
let currentKwdIndex = 0;

let myKeywords = ['바이젠셀', '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', '지아이이노베이션', '에이프릴바이오', '큐리언트', '티움바이오', '엔케이맥스', '파멥신', '앱클론', '오스코텍', '박셀바이오', '지씨셀', '셀리드', '헬릭스미스', '제넥신', '유틸렉스', '고바이오랩', '올리패스', '올릭스', '코오롱티슈진', '디앤디파마텍', '넥스트바이오메디컬', '보로노이', '샤페론', '브릿지바이오테라퓨틱스', '에스씨엠생명과학', '카이노스메드', '이수앱지스', '안트로젠', '아이진', '펩트론', '인벤티지랩'];
let filterKeywords = ['승인', '허가', '특허','획득', 'FDA', 'NDA', '샌드박스', 'CSR', '결과보고서', '성공', 'L/O', '계약', '공시'];

const delay = ms => new Promise(res => setTimeout(res, ms));

class BaseScraper {
    constructor(keyword) {
        this.keyword = keyword;
        this.encodedKeyword = encodeURIComponent(keyword);
    }
    async fetch(url) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
                timeout: 12000,
                family: 4 
            });
            return res?.data ? cheerio.load(res.data) : null;
        } catch (e) { return null; }
    }
    isToday(dateText) {
        if (!dateText) return false;
        const now = moment();
        const todayStr1 = now.format('YYYY.MM.DD');
        const todayStr2 = now.format('MM.DD');
        const todayStr3 = now.format('YYYY-MM-DD');
        const relativeTerms = ['시간전', '분전', '초전', '방금', '오늘', '시전'];
        return dateText.includes(todayStr1) || dateText.includes(todayStr2) || dateText.includes(todayStr3) || relativeTerms.some(t => dateText.includes(t));
    }
    makeAbsoluteUrl(href, base) {
        if (!href) return '';
        return href.startsWith('http') ? href : new URL(href, base).href;
    }
}

/* --- 언론사별 개별 클래스 (HTML 구조 최적화) --- */

class TheBio extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.thebionews.net/news/articleList.html?sc_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.article-list .item, .list-block').each((i, el) => {
            const title = $(el).find('.titles a, .title a').text().trim();
            const date = $(el).find('.date, .info').text().trim();
            const link = $(el).find('a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.thebionews.net') });
        });
        return list;
    }
}

class PharmNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.pharmnews.com/news/articleList.html?sc_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.type1 li').each((i, el) => {
            const title = $(el).find('.titles a').text().trim();
            const date = $(el).find('.dated, .info').text().trim();
            const link = $(el).find('.titles a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.pharmnews.com') });
        });
        return list;
    }
}

class DailyPharm extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.dailypharm.com/user/news/search?searchKeyword=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.act_list_sty2 li').each((i, el) => {
            const title = $(el).find('.lin_title').text().trim();
            const date = $(el).find('.lin_date, .lin_cont').text().trim();
            const link = $(el).find('a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.dailypharm.com') });
        });
        return list;
    }
}

class BioTimes extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.biotimes.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.list-block, .item').each((i, el) => {
            const title = $(el).find('.title a, .titles a').text().trim();
            const date = $(el).find('.date, .list-dated').text().trim();
            const link = $(el).find('a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'http://www.biotimes.co.kr') });
        });
        return list;
    }
}

class Yakup extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.yakup.com/search/index.html?csearch_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.news_item, li').each((i, el) => {
            const title = $(el).find('a').text().trim();
            const date = $(el).find('.date, .time').text().trim();
            const link = $(el).find('a').attr('href');
            if (title.length > 5 && this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.yakup.com') });
        });
        return list;
    }
}

class HitNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.hitnews.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.type1 li').each((i, el) => {
            const title = $(el).find('.titles a').text().trim();
            const date = $(el).find('.dated, .info').text().trim();
            const link = $(el).find('.titles a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'http://www.hitnews.co.kr') });
        });
        return list;
    }
}

class MediPharmToday extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.pharmstoday.com/news/articleList.html?sc_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.article-list .item, li').each((i, el) => {
            const title = $(el).find('.titles a, .title a').text().trim();
            const date = $(el).find('.date, .info').text().trim();
            const link = $(el).find('a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'https://www.pharmstoday.com') });
        });
        return list;
    }
}

class MedicalNews extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`http://www.bosa.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.article-list .item, li').each((i, el) => {
            const title = $(el).find('.titles a').text().trim();
            const date = $(el).find('.date, .info').text().trim();
            const link = $(el).find('a').attr('href');
            if (this.isToday(date)) list.push({ title, link: this.makeAbsoluteUrl(link, 'http://www.bosa.co.kr') });
        });
        return list;
    }
}

class MoneyToday extends BaseScraper {
    async getNewsList() {
        const $ = await this.fetch(`https://www.mt.co.kr/search?keyword=${this.encodedKeyword}`);
        const list = [];
        if ($) $('.article_item').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const date = $(el).find('.date').text().trim();
            const link = $(el).find('a').first().attr('href');
            if (this.isToday(date)) list.push({ title, link });
        });
        return list;
    }
}

const scrapersMap = { 
    '더바이오': TheBio, '팜뉴스': PharmNews, '데일리팜': DailyPharm, 
    '바이오타임즈': BioTimes, '약업닷컴': Yakup, '히트뉴스': HitNews, 
    '메디팜스투데이': MediPharmToday, '의학신문': MedicalNews, '머니투데이': MoneyToday 
};

/* --- 실행 및 모니터링 로직 --- */

async function runMonitoring(chatId) {
    if (!check) return;
    const logTime = () => moment().format('HH:mm:ss');
    const keyword = myKeywords[currentKwdIndex];
    currentKwdIndex = (currentKwdIndex + 1) % myKeywords.length;

    console.log(`[${logTime()}] 🔍 검사 시작: [${keyword}]`);

    try {
        // 병렬 처리: 모든 사이트 동시 요청
        const results = await Promise.all(Object.entries(scrapersMap).map(async ([site, Scraper], i) => {
            await delay(i * 200); // 봇 차단 방지 미세 딜레이
            try {
                const items = await new Scraper(keyword).getNewsList();
                return { site, items };
            } catch (e) { return { site, items: [] }; }
        }));

        for (const { site, items } of results) {
            for (const item of items) {
                // 1. 종목명 포함 검증
                if (!item.title.toLowerCase().includes(keyword.toLowerCase())) continue;

                // 2. 필터 키워드 검증
                const hasFilter = filterKeywords.some(f => item.title.includes(f));
                
                // 발견 로그 무조건 출력
                console.log(`[${logTime()}][${keyword}][${site}] 발견: ${item.title.substring(0, 30)}...`);

                if (hasFilter && !compare_map.has(`${site}_${item.title}`)) {
                    compare_map.set(`${site}_${item.title}`, true);
                    await bot.sendMessage(chatId, `[${site}] **${item.title}**\n\n🔗 ${item.link}`, { parse_mode: 'Markdown' });
                    console.log(`[${logTime()}][${keyword}][${site}] ✅ 텔레그램 발송 성공`);
                }
            }
        }
    } catch (e) { console.log(`[에러] ${e.message}`); }

    console.log(`[${logTime()}] 🏁 [${keyword}] 완료. 10초 후 다음 종목...`);
    playAlert = setTimeout(() => runMonitoring(chatId), 1000);
}

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

console.log("✅ 2026년 오늘 뉴스 대응 풀버전(9개사) 가동 중...");