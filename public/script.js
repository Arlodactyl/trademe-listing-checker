const form = document.getElementById('listing-form');
const submitButton = document.getElementById('submit-button');
const formError = document.getElementById('form-error');
const results = document.getElementById('results');

const importUrlInput = document.getElementById('import-url');
const importButton = document.getElementById('import-button');
const importError = document.getElementById('import-error');

// rule ids come back as kebab-case ("hedge-language"), turn that into something
// readable without needing to keep a separate label for every rule id
function toReadableLabel(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.querySelector('.button__label').textContent = isLoading ? 'Checking…' : 'Check this listing';
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = '';
}

function setImportLoading(isLoading) {
  importButton.disabled = isLoading;
  importButton.querySelector('.button__label').textContent = isLoading ? 'Fetching…' : 'Fetch listing';
}

function showImportError(message) {
  importError.textContent = message;
  importError.hidden = false;
}

function clearImportError() {
  importError.hidden = true;
  importError.textContent = '';
}

// fills in whatever came back from the import, leaves everything else alone,
// and never touches a field the import didn't return anything for
function populateFormFromImport(listing) {
  if (listing.title) form.elements.title.value = listing.title;
  if (listing.description) form.elements.description.value = listing.description;
  if (listing.price !== undefined) form.elements.price.value = listing.price;
  if (listing.category) form.elements.category.value = listing.category;

  const feedback = listing.sellerFeedback;
  if (feedback) {
    if (feedback.percentPositive !== undefined) form.elements.percentPositive.value = feedback.percentPositive;
    if (feedback.reviewCount !== undefined) form.elements.reviewCount.value = feedback.reviewCount;
    if (feedback.memberSince) form.elements.memberSince.value = feedback.memberSince;
  }
}

function buildListingFromForm(formData) {
  const listing = {
    title: formData.get('title')?.trim() || '',
    description: formData.get('description')?.trim() || '',
    category: formData.get('category')?.trim() || undefined,
  };

  const price = formData.get('price');
  if (price) listing.price = Number(price);

  // only send a sellerFeedback object at all if the seller actually filled in
  // at least one of these, an empty object would just confuse the backend rules
  const percentPositive = formData.get('percentPositive');
  const reviewCount = formData.get('reviewCount');
  const memberSince = formData.get('memberSince');

  if (percentPositive || reviewCount || memberSince) {
    listing.sellerFeedback = {
      percentPositive: percentPositive ? Number(percentPositive) : undefined,
      reviewCount: reviewCount ? Number(reviewCount) : undefined,
      memberSince: memberSince || undefined,
    };
  }

  return listing;
}

function renderFinding(finding) {
  const item = document.createElement('div');
  item.className = `finding finding--${finding.severity}`;
  item.innerHTML = `
    <span class="finding__marker"></span>
    <div class="finding__body">
      <p class="finding__id">${toReadableLabel(finding.id)}</p>
      <p class="finding__message">${finding.message}</p>
    </div>
  `;
  return item;
}

function renderResults(result) {
  results.innerHTML = '';

  const level = document.createElement('span');
  level.className = `results__level results__level--${result.riskLevel}`;
  level.textContent = `${result.riskLevel} risk`;
  results.appendChild(level);

  const findingsTitle = document.createElement('p');
  findingsTitle.className = 'results__section-title';
  findingsTitle.textContent = 'Pattern checks';
  results.appendChild(findingsTitle);

  if (result.triggered.length === 0) {
    const clean = document.createElement('p');
    clean.className = 'results__clean';
    clean.textContent = 'Nothing flagged by the free pattern checks.';
    results.appendChild(clean);
  } else {
    result.triggered.forEach((finding) => results.appendChild(renderFinding(finding)));
  }

  if (result.haiku) {
    const haikuTitle = document.createElement('p');
    haikuTitle.className = 'results__section-title';
    haikuTitle.textContent = "Claude's read";
    results.appendChild(haikuTitle);

    const note = document.createElement('div');
    note.className = 'haiku-note';
    note.innerHTML = `
      <p class="haiku-note__level">${result.haiku.concernLevel} concern</p>
      <p class="haiku-note__notes">${result.haiku.notes}</p>
    `;
    results.appendChild(note);
  }

  results.hidden = false;
}

importButton.addEventListener('click', async () => {
  clearImportError();
  const url = importUrlInput.value.trim();

  if (!url) {
    showImportError('Paste a Trade Me listing link first.');
    return;
  }

  setImportLoading(true);

  try {
    const response = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const body = await response.json();

    if (!response.ok) {
      showImportError(body.error || 'Could not import that listing.');
      return;
    }

    populateFormFromImport(body);
  } catch (err) {
    showImportError('Could not reach the server. Check your connection and try again.');
  } finally {
    setImportLoading(false);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError();
  results.hidden = true;
  setLoading(true);

  try {
    const listing = buildListingFromForm(new FormData(form));
    const response = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listing),
    });

    const body = await response.json();

    if (!response.ok) {
      showFormError(body.error || 'Something went wrong checking that listing.');
      return;
    }

    renderResults(body);
  } catch (err) {
    showFormError('Could not reach the server. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
});
