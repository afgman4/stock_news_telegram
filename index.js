const TelegramBot = require('node-telegram-bot-api');
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require('moment');

const token = '8483984900:AAH3mF9GKrXb8s8k7DefCfke7Xw6J9FzpDs';
const bot = new TelegramBot(token, { polling: true });

let check = false;
let playAlert = null;
let compare_map = new Map();
let currentKwdIndex = 0;

let myKeywords = ['바이젠셀',
    '젠큐릭스', '큐라클', '압타바이오', '퓨쳐켐', '메지온', '지아이이노베이션', '에이프릴바이오', '큐리언트', '티움바이오', 
    '엔케이맥스', '파멥신', '앱클론', '오스코텍', '박셀바이오', '지씨셀', '셀리드', '헬릭스미스', '제넥신', '유틸렉스', '고바이오랩', '올리패스',
    '올릭스','코오롱티슈진','디앤디파마텍','넥스트바이오메디컬','보로노이','샤페론','지아이이노베이션','브릿지바이오테라퓨틱스','티움바이오',
    '에스씨엠생명과학','카이노스메드','큐리언트','앱클론','이수앱지스','안트로젠','아이진','펩트론','인벤티지랩'];
let filterKeywords = ['승인', '허가', '획득', 'FDA', 'NDA', '샌드박스', 'CSR', '결과보고서', '성공', 'L/O', '계약', '공시'];

class BaseScraper {
    constructor(keyword) {
        this.keyword = keyword;
        this.encodedKeyword = encodeURIComponent(keyword);
    }
    async fetch(url) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36' },
                timeout: 10000
            });
            return res && res.data ? cheerio.load(res.data) : null;
        } catch (e) { return null; }
    }
    validate(title) {
        return title && title.toLowerCase().includes(this.keyword.toLowerCase());
    }
    isToday(dateText) {
        const today = moment().format('YYYY.MM.DD');
        const todayHyphen = moment().format('YYYY-MM-DD');
        const todayNoDot = moment().format('YYYYMMDD');
        const cleanDate = dateText.replace(/[^0-9\-.]/g, ''); 
        return cleanDate.includes(today) || cleanDate.includes(todayHyphen) || cleanDate.includes(todayNoDot) || dateText.includes('시전') || dateText.includes('분전');
    }
}

/**
 * 언론사별 맞춤형 스크래퍼 구현
 */
class TheBio extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.thebionews.net/news/articleList.html?sc_area=A&view_type=sm&sc_word=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.titles a').each((i, el) => { const date = $(el).closest('.item').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'https://www.thebio.co.kr' + $(el).attr('href') }); }); return list; } }
class BioTimes extends BaseScraper { async getNewsList() { const $ = await this.fetch(`http://www.biotimes.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.list-titles a').each((i, el) => { const date = $(el).closest('.list-block').find('.list-dated').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'http://www.biotimes.co.kr' + $(el).attr('href') }); }); return list; } }
class PharmNews extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.pharmnews.com/news/articleList.html?sc_word=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.titles a').each((i, el) => { const date = $(el).closest('.item').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'https://www.pharmnews.com' + $(el).attr('href') }); }); return list; } }
class Yakup extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.yakup.com/news/index.html?mode=search&kw=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.news-list .title a').each((i, el) => { const date = $(el).closest('li').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'https://www.yakup.com' + $(el).attr('href') }); }); return list; } }
class DailyPharm extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.dailypharm.com/user/news/search?dropBarMode=search&searchOption=any&searchKeyword=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.newsList .title a').each((i, el) => { const date = $(el).closest('li').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: $(el).attr('href') }); }); return list; } }
class MedicalTimes extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.medicaltimes.com/Main/Search.php?keyword=${this.encodedKeyword}&x=0&y=0`); if (typeof $ !== 'function') return []; const list = []; $('.newsList .title').each((i, el) => { const date = $(el).closest('li').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'https://www.medicaltimes.com' + $(el).parent().attr('href') }); }); return list; } }
class HitNews extends BaseScraper { async getNewsList() { const $ = await this.fetch(`http://www.hitnews.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.titles a').each((i, el) => { const date = $(el).closest('.item').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'http://www.hitnews.co.kr' + $(el).attr('href') }); }); return list; } }
class MediPharmToday extends BaseScraper { async getNewsList() { const $ = await this.fetch(`https://www.pharmstoday.com/news/articleList.html?sc_area=A&view_type=sm&sc_word=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.titles a').each((i, el) => { const date = $(el).closest('.item').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'http://www.pharmstoday.com' + $(el).attr('href') }); }); return list; } }
class MedicalNews extends BaseScraper { async getNewsList() { const $ = await this.fetch(`http://www.bosa.co.kr/news/articleList.html?sc_word=${this.encodedKeyword}`); if (typeof $ !== 'function') return []; const list = []; $('.titles a').each((i, el) => { const date = $(el).closest('.item').find('.date').text(); if(this.isToday(date)) list.push({ title: $(el).text().trim(), link: 'http://www.bosa.co.kr' + $(el).attr('href') }); }); return list; } }
class MoneyToday extends BaseScraper { 
    async getNewsList() {
        const $ = await this.fetch(`https://www.mt.co.kr/search?keyword=${this.encodedKeyword}`);
        if (typeof $ !== 'function') return [];
        const list = [];
        $('.article_item').each((i, el) => {
            const title = $(el).find('h3.headline').text().replace(/\s+/g, ' ').trim();
            const link = $(el).find('a').first().attr('href');
            const date = $(el).find('.article_date').text();
            if (this.isToday(date)) list.push({ title, link });
        });
        return list;
    }
}

const scrapersMap = { '더바이오': TheBio, '팜뉴스': PharmNews, '약업닷컴': Yakup, '데일리팜': DailyPharm, '메디칼타임즈': MedicalTimes, '히트뉴스': HitNews, '메디팜스투데이': MediPharmToday, '의학신문': MedicalNews, '머니투데이': MoneyToday };

async function runMonitoring(chatId) {
    if (!check) return;
    try {
        const keyword = myKeywords[currentKwdIndex];
        currentKwdIndex = (currentKwdIndex + 1) % myKeywords.length;
        
        for (const [name, ScraperClass] of Object.entries(scrapersMap)) {
            const time = moment().format('HH:mm:ss');
            try {
                const scraper = new ScraperClass(keyword);
                const rawList = await scraper.getNewsList();

                if (rawList && rawList.length > 0) {
                    let sentInThisRound = false;
                    for (const item of rawList) {
                        if (scraper.validate(item.title)) {
                            const hasFilter = filterKeywords.length === 0 || filterKeywords.some(f => item.title.includes(f));
                            if (hasFilter) {
                                const uniqueKey = `${name}_${item.title}`;
                                if (!compare_map.has(uniqueKey)) {
                                    compare_map.set(uniqueKey, true);
                                    const logTime = moment().format('HH:mm');
                                    bot.sendMessage(chatId, `[${logTime}] [${name}] **${item.title}**\n\n🔗 ${item.link}`, { parse_mode: 'Markdown' });
                                    console.log(`[성공][${time}][${name}][${item.title}][${item.link}]`);
                                }
                                sentInThisRound = true;
                            }
                        }
                    }
                    if (!sentInThisRound) console.log(`[실패][${time}][${name}][오늘자 기사는 있으나 필터 조건 불일치]`);
                } else {
                    console.log(`[실패][${time}][${name}][오늘자 조회된 데이터 없음]`);
                }
            } catch (e) { console.log(`[실패][${time}][${name}][에러발생]`); }
            await new Promise(r => setTimeout(r, 800));
        }
    } catch (err) { console.error(err); }
    playAlert = setTimeout(() => runMonitoring(chatId), 30000);
}

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === '/on') {
        check = true; 
        // compare_map.clear(); // 주석 처리하면 프로그램 실행 중 보낸 기사는 절대 다시 안 보냄
        bot.sendMessage(chatId, "🚀 10개 매체 오늘자 뉴스 실시간 감시 시작");
        runMonitoring(chatId);
    } else if (msg.text === '/off') {
        check = false; clearTimeout(playAlert);
        bot.sendMessage(chatId, "🛑 중지되었습니다.");
    }
});

console.log("🚀 [10개 매체 통합 모니터링] 서버 가동 중...");