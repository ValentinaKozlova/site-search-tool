const needle = require('needle');
const fs = require('fs');
const parse = require('node-html-parser').parse;
const prompt = require('prompt');

async function openUrl(url) {
    return needle('get', url)
        .then((response) => {
            if (response.statusCode === 200) {
                return parse(response.body)
            }
        })
        .catch(err => console.log(err))
}

function tryParseUrl(base, acc, url) {
    try {
        return [...acc, new URL(url, base)];
    } catch (e) {
        console.error(`invalid url=${url}, base=${base}`, e);
    }

    return acc;
}

function findLinks(html, baseUrl) {
    const base = new URL(baseUrl);

    const links = html && html.querySelectorAll('a[href]') || [];
    
    return links
        .map(l => l.getAttribute('href'))
        .reduce(tryParseUrl.bind(null, base), [])
        .filter(url => url.host === base.host)
        .map(url => {
            console.log(url)
            return url.toString()
        });
}

async function crawlPage(search_fn, {url, level}) {
    try {
        let html = await openUrl(url);
        return {url, level, links: findLinks(html, url), result: search_fn(html)};
    } catch (e) {
        console.error(`request failed url=${url}`, e);
        return {url, level, links: [], result: null}
    }
}

function startTask(search_fn, {url, level}) {
    return {url, task: crawlPage(search_fn, {url, level})};
}

function mergeTasks(acc, {url, task}) {
    return {urls: [...acc.urls, url], tasks: {...acc.tasks, [url]: task}};
}

function search(keyword, html) {
    const body = html && html.querySelector('body');
    const pageContent = body && body.innerText;
    const searchResults = pageContent && findSearchKeyword(pageContent, keyword);
    return searchResults || [];
}

function findSearchKeyword(content, keyword, contextLength) {
    contextLength = contextLength || 2
    var searchRegexp = new RegExp(`(\\w+.){${contextLength}}(${keyword})(.\\w+){${contextLength}}`, 'gmi')
    return content.match(searchRegexp)
}

async function crawl(search_fn, rootUrl, depth = 2) {
    let results = [];

    let {tasks, urls} = mergeTasks(
        {tasks: {}, urls: []},
        startTask(search_fn, {url: rootUrl, level: 0})
    )

    while (Object.keys(tasks).length > 0) {
        let {url, links, result, level} = await Promise.race(Object.values(tasks));

        delete tasks[url];

        if (level < depth && links) {
            let started = links
                .filter(url => !urls.includes(url))
                .map(url => ({level: level + 1, url}))
                .map(startTask.bind(null, search_fn))
                .reduce(mergeTasks, {urls: [], tasks: {}});

            urls = [...urls, ...new Set(started.urls)];
            tasks = {...tasks, ...started.tasks};
        }

        results.push({url, result});
    }

    return results;
}

prompt.start()
prompt.get(['url', 'keyword'], function (err, result) {
    if (err) { console.log(err) }
    const url = result.url || 'https://www.udemy.com'
    const keyword = result.keyword || 'software'
    console.log('Command-line input received:');
    console.log('URL: ' + url);
    console.log('search keyword: ' + keyword);
    crawl(search.bind(null, [keyword]), url).then((res) => {
        console.log(`Crawled ${res.length}`)
        const resultsFound = res.reduce((count, {result}) => result.length !== 0? count+1 : count, 0)
        console.log(`Found ${resultsFound} pages with term ${keyword}.\nCheck results.txt for the result`)
        fs.writeFileSync('./results.txt', JSON.stringify(res));
    })
});