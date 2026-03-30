const url = "https://www.google.com/maps/place/Glorex+Infotech/data=!4m7!3m6!1s0x3badcd337b222e2f:0xb11787722e8e8603!8m2!3d12.5999859!4d78.1296285!16s%2Fg%2F11s9y4k26g!19sChIJLy4iezPNrTsRA4aOLnKHF7E?authuser=0&hl=en&rclk=1";

fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
.then(r => r.text())
.then(t => {
    // Title
    const title = t.match(/<meta content="([^"]+)" itemprop="name"/i);
    console.log("Title:", title ? title[1] : null);

    // Initial State string
    const stateMatch = t.match(/window\.APP_INITIALIZATION_STATE=\[\[(.*?)(?:\]\];|<\/script>)/s);
    if(stateMatch) {
        console.log("Matched app init state length:", stateMatch[1].length);
        const chunk = stateMatch[1];
        
        // Website URL regex
        const webMatch = chunk.match(/https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\"]*)?/g);
        console.log("Websites in array:", webMatch ? [...new Set(webMatch)].filter(u => !u.includes('google.com')) : []);

        // Phone regex (e.g. +91 99999 99999 or (123) 456-7890)
        // More specific JSON extraction is usually 
        const phoneMatch = chunk.match(/\[null,null,"(\+?[0-9\s\-\(\)]{8,20})"/);
        console.log("Phone JSON exact match:", phoneMatch ? phoneMatch[1] : chunk.match(/\+?[0-9][0-9\s\-\(\)]{8,20}/g));
    }
});
