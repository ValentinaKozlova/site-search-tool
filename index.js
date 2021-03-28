const needle = require('needle');
var fs = require('fs');
var extractDomain = require('extract-domain');
const parse = require('node-html-parser').parse;

async function openUrl(url) {
    return needle('get', url)
        .then((response) => {
            if (response.statusCode == 200) {
                return parse(response.body)
            }
        })
        .catch(err => console.log(err))
}

function findLinks(html, url) {
    if (!html) return
    const links = html.querySelectorAll('a[href]')
    let linksArr = []
    //TODO check that link is valid
    //TODO check relative and absolutes URLs
    links.forEach(link => {
        const href = link.getAttribute('href')
        const domain = extractDomain(url)
        const linkRegExp = new RegExp(`^http(|s):\/\/|(www).${domain}`, 'gi')
        const isCurrentDomain = linkRegExp.test(href)
        if (isCurrentDomain) {
            linksArr.push(href)
        }
    })
    return linksArr
}

async function crawlPage(search_fn, {url, level}) {
    try {
        let html = await openUrl(url);
        return {url, level, links: findLinks(html, url), result: search_fn(html)};
    } catch (e) {
        console.error(e);
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

            urls = [...urls, started.urls];
            tasks = {...tasks, ...started.tasks};
        }

        results.push({url, result});
    }

    return results;
}

crawl(search.bind(null, ['expert']), 'https://www.justanswer.com/law/').then((res) => {
    console.log(`Crawled ${res.length}`)
    const resultsFound = res.reduce((count, {result}) => result.length !== 0? count+1 : count, 0)
    console.log(`Found ${resultsFound}`)
    fs.writeFileSync('./results.txt', JSON.stringify(res));
})
// crawl(search.bind(null, ['code']), 'https://medium.com/')
// crawl(search.bind(null, ['flex']), 'https://css-tricks.com/ ')