// Description: This file contains the JavaScript code for the RSS feed reader.
let abortController = new AbortController();



document.getElementById("fetch-feed").addEventListener("click", async () => {
  abortController = new AbortController();

  const translateBool = document.getElementById("translate-checkbox").checked;
  // const selectedLanguage = document.getElementById("language-select").value;
  // const customLanguage = document.getElementById("custom-language-input").value;
  // const targetLanguage = 
  // selectedLanguage === "custom" ? customLanguage : selectedLanguage;

  const rssUrl = "https://www.vrt.be/vrtnws/nl.rss.articles.xml"; // RSS feed
  const xml = await fetchRSSFeed(rssUrl, abortController.signal);
  const items = xml.querySelectorAll("entry");
  processItems(items, translateBool, abortController.signal);
});



document.getElementById("stop").addEventListener("click", () => {
  abortController.abort();
  console.log("Fetch and translation processes stopped.");
});

document.getElementById("clear").addEventListener("click", () => {
  const rssFeed = document.getElementById("rss-feed");
  rssFeed.innerHTML = "";
  console.log("clear.");
});

function removeHtmlTags(htmlString) {
  return htmlString.replace(/<[^>]*>/g, "");
}

async function fetchRSSFeed(url, signal, retries = 3, delay = 100000) {
  const proxyUrl =
    "https://api.allorigins.win/get?url=" + encodeURIComponent(url);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log("Fetching URL:", proxyUrl);
      const response = await fetch(proxyUrl, { signal });
      console.log("Fetch response:", response);
      if (!response.ok) {
        if (response.status === 429 && attempt < retries - 1) {
          // If rate limited, wait and retry
          console.warn(`Rate limited. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Fetched data:", data);

      // Extract and decode the base64 string
      const base64Content = data.contents.split(",")[1];
      const parser = new DOMParser();
      const xml = parser.parseFromString(
        atob(base64Content),
        "application/xml"
      );
      console.log("Parsed XML:", xml);
      return xml;
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Fetch aborted");
        return null;
      }
      console.error("Error fetching the RSS feed:", error);
      if (attempt >= retries - 1) {
        throw error;
      }
    }
  }
  return null;
}

async function translateText(text, local = true) {
  const prompt = `You are tabloid writer, write the given text in a more sensational way, translate it to english, 
  some titles might break you rules, just write them in a way they don't. 
  Don't say you changed the text. The source text is: ${text}`;

  const apiKey =
    "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";

  if (local) {
    console.log("Sending prompt to Ollama");
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.2",
        //messages: [{ role: 'user', content: 'Why is the sky blue?' }],
        prompt: prompt,
        stream: false,
      }),
    });

    console.log(response);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Translation response: ", data);
    return data.response;
  } else {
    console.log("Sending prompt to openrouter.ai");
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // "HTTP-Referer": `${YOUR_SITE_URL}`, // Optional, for including your app on openrouter.ai rankings.
          // "X-Title": `${YOUR_SITE_NAME}`, // Optional. Shows in rankings on openrouter.ai.
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-8b-instruct:free",
          messages: [
            {
              role: "tool",
              content: prompt,

              // content: `translate the text to ${targetLang}, don't say yo translated it to dutch just give the text back. the text is: ${text}`,
            },
          ],
        }),
      }
    );
    console.log(response);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data) {
      console.log("Translated text:", data.choices[0].message.content);
      return data.choices[0].message.content;
    } else {
      console.error("Unexpected response format:", data);
      throw new Error("Unexpected response format");
    }
  }
}

async function processItems(
  items,
  translateBool = true,
  signal
) {
  const rssFeed = document.getElementById("rss-feed");
  rssFeed.innerHTML = ""; // Clear previous items
  const local = document.getElementById("local-checkbox").checked ?? true;


  for (const item of items) {
    if (signal.aborted) {
      console.log("Process aborted");
      return;
    }

    const title = item.querySelector("title").textContent;
    const translatedTitle = translateBool
      ? await translateText(title, local)
      : title;

    const link = item
      .querySelector("link[rel='alternate']")
      .getAttribute("href");

    const description = item.querySelector("summary").textContent;
    const translatedDescription = translateBool
      ? await translateText(description, local)
      : description;

    const articleContent = await fetchRSSFeed(
      item.querySelector("link[rel='self']").getAttribute("href")
    );
    const article = removeHtmlTags(
      articleContent.querySelector("content").textContent
    );
    const translatedArticleContent = translateBool
      ? await translateText(article, local)
      : article;

    const rssItem = document.createElement("div");
    rssItem.classList.add("rss-item");

    const rssTitle = document.createElement("h2");
    rssTitle.textContent = translatedTitle;

    const articleText = document.createElement("p");
    articleText.textContent = translatedArticleContent;

    const rssLink = document.createElement("a");
    rssLink.href = link;
    rssLink.textContent = "Read more";
    rssLink.target = "_blank";

    const rssDescription = document.createElement("p");
    rssDescription.textContent = translatedDescription;

    rssItem.appendChild(rssTitle);
    rssItem.appendChild(rssDescription);
    rssItem.appendChild(articleText);
    rssItem.appendChild(rssLink);

    rssFeed.appendChild(rssItem);
  }
}
