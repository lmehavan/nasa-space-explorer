// 1. Find the HTML elements we want to update.
const startInput = document.querySelector('#startDate');
const endInput = document.querySelector('#endDate');
const form = document.querySelector('#searchForm');
const gallery = document.querySelector('#gallery');
const statusMessage = document.querySelector('#status');
const searchButton = document.querySelector('#searchButton');
const dialog = document.querySelector('#detailDialog');

// 2. Keep the supplied dateRange.js unchanged. Add our exact-nine-day rule here.
setupDateInputs(startInput, endInput);
function addDays(dateText, days) {
  const date = new Date(dateText + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const nasaToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
startInput.max = addDays(nasaToday, -8);
endInput.max = nasaToday;
startInput.value = addDays(nasaToday, -8);
endInput.value = nasaToday;
startInput.addEventListener('change', () => {
  endInput.value = startInput.value ? addDays(startInput.value, 8) : '';
});

// 3. Pick one random fact on each page load.
const facts = [
  'Sunlight takes about eight minutes to reach Earth.',
  'Venus takes longer to rotate once than to orbit the Sun.',
  'The Moon shines by reflecting sunlight.',
  'Jupiter is the largest planet in our solar system.',
  'A light-year measures distance, not time.'
];
document.querySelector('#fact').textContent = facts[Math.floor(Math.random() * facts.length)];

// NASA's new API includes HTML in explanations. Extract text; never insert API HTML.
function plainText(value) {
  const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
  return parsed.body.textContent.trim();
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

// 4. fetch() requests data; json() converts the response into JavaScript objects.
async function getJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 429) throw new Error('NASA’s request limit was reached. Wait and retry.');
      if (response.status === 403) throw new Error('NASA rejected the API key. Check it in API settings.');
      throw new Error('NASA returned HTTP ' + response.status + '. Try another date range.');
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}
function compactDate(date) { return date.replaceAll('-', '').slice(2); }
async function currentAPOD(start, end) {
  // The current endpoint uses YYMMDD, date_from, and date_to (verified with NASA).
  const params = new URLSearchParams({
    date_from: compactDate(start), date_to: compactDate(end), per_page: '9'
  });
  return getJSON('https://science.nasa.gov/wp-json/wp/v2/apod-basic?' + params);
}
async function fetchAPOD(start, end) {
  if (document.querySelector('#service').value === 'legacy') {
    const apiKey = document.querySelector('#apiKey').value.trim() || 'DEMO_KEY';
    const params = new URLSearchParams({ api_key: apiKey, start_date: start, end_date: end });
    try {
      const entries = await getJSON('https://api.nasa.gov/planetary/apod?' + params);
      if (!Array.isArray(entries) || entries.some(item => item.title === 'NASA Science')) {
        throw new Error('Legacy API returned placeholder data.');
      }
      return { entries, note: 'Loaded from NASA’s legacy API.' };
    } catch {
      statusMessage.textContent = 'Legacy service unavailable or returned placeholders. Trying NASA’s current service…';
      const entries = await currentAPOD(start, end);
      return { entries, note: 'Loaded from the current NASA API after legacy fallback.' };
    }
  }
  return { entries: await currentAPOD(start, end), note: 'Live data from NASA Science.' };
}

// 5. Create a clickable card for each day. Button elements support keyboard users.
function makeImage(item) {
  const image = document.createElement('img');
  const original = safeUrl(item.hdurl || item.url);
  let source = original;
  if (!large && original) {
    const resized = new URL(original);
    if (resized.hostname === 'assets.science.nasa.gov') {
      resized.searchParams.set('w', '800');
      resized.searchParams.set('h', '0');
      source = resized.href;
    }
  }
  image.src = source;
  image.alt = plainText(item.alt || item.title);
  image.loading = 'eager';
  image.addEventListener('error', () => {
    const message = document.createElement('p');
    message.textContent = 'Image unavailable. Open the original NASA page for this entry.';
    image.replaceWith(message);
  }, { once: true });
  return image;
}
function renderGallery(entries) {
  gallery.replaceChildren();
  entries.forEach(item => {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    const visual = document.createElement('div');
    visual.className = 'visual';
    if (item.media_type === 'image') visual.append(makeImage(item));
    else visual.textContent = '▶  Explore this video';
    const copy = document.createElement('div');
    copy.className = 'card-copy';
    const date = document.createElement('div');
    date.className = 'eyebrow';
    date.textContent = item.date + ' / ' + (item.media_type || 'media');
    const title = document.createElement('h3');
    title.textContent = plainText(item.title);
    copy.append(date, title);
    card.append(visual, copy);
    card.addEventListener('click', () => openDetails(item));
    gallery.append(card);
  });
}

// 6. The native dialog handles focus trapping and Escape-to-close for us.
function openDetails(item) {
  document.querySelector('#detailTitle').textContent = plainText(item.title);
  document.querySelector('#detailDate').textContent = item.date;
  document.querySelector('#detailExplanation').textContent = plainText(item.explanation);
  document.querySelector('#detailCredit').textContent = plainText(item.credit || item.copyright || 'NASA APOD');
  const media = document.querySelector('#detailMedia');
  media.replaceChildren();
  const link = document.querySelector('#detailLink');
  link.href = safeUrl(item.permalink || item.url) || 'https://science.nasa.gov/apod/';
  link.textContent = item.media_type === 'video' ? 'Watch video ↗' : 'Open original on NASA ↗';
  if (item.media_type === 'image') media.append(makeImage(item));
  else {
    const note = document.createElement('p');
    note.className = 'video-note';
    note.textContent = '▶ This day features a video. Use the “Watch video” link below to open it.';
    media.append(note);
  }
  dialog.showModal();
}
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) {
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
} });

// 7. Run the request, show progress, and always re-enable the form afterwards.
async function loadGallery(event) {
  if (event) event.preventDefault();
  if (!form.reportValidity()) return;
  const start = startInput.value;
  const end = addDays(start, 8);
  if (start < earliestDate || end > nasaToday) {
    statusMessage.textContent = 'Choose nine complete days between June 16, 1995 and today.';
    return;
  }
  endInput.value = end;
  searchButton.disabled = true;
  startInput.disabled = true;
  gallery.setAttribute('aria-busy', 'true');
  gallery.replaceChildren();
  statusMessage.textContent = 'Loading space photos…';
  try {
    if (window.nasaServiceWorkerReady) {
      await window.nasaServiceWorkerReady;
    }
    const { entries, note } = await fetchAPOD(start, end);
    if (!Array.isArray(entries)) throw new Error('NASA returned an unexpected response. Please retry.');
    // Check the dates so we never show unrelated days or duplicate entries.
    const valid = entries.filter(item => item.date >= start && item.date <= end);
    const unique = [...new Map(valid.map(item => [item.date, item])).values()];
    unique.sort((a, b) => a.date.localeCompare(b.date));
    renderGallery(unique);
    statusMessage.textContent = unique.length === 9
      ? `9 discoveries · ${start} to ${end}. ${note}`
      : `${unique.length} of 9 days available. NASA may not have published every requested day. Try an older range.`;
    if (!unique.length) gallery.textContent = 'No entries available for these dates.';
  } catch (error) {
    statusMessage.textContent = error.name === 'AbortError'
      ? 'NASA took too long to respond. Please try again.'
      : 'Unable to load: ' + error.message + ' Check your connection and retry.';
  } finally {
    searchButton.disabled = false;
    startInput.disabled = false;
    gallery.setAttribute('aria-busy', 'false');
  }
}
form.addEventListener('submit', loadGallery);
loadGallery();
