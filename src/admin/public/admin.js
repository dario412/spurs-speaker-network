// Progressive enhancement only: every form works without this file.
// 1. Keeps each colour picker and its text field in step.
// 2. Updates an image thumbnail when its image id changes (URLs come from the #image-ids datalist).
// 3. Adds a tick-all checkbox to the Licences table.

for (const picker of document.querySelectorAll('input[type=color][data-pair]')) {
  const text = document.getElementById(picker.dataset.pair);
  if (!text) continue;
  picker.addEventListener('input', () => {
    text.value = picker.value;
  });
  text.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value.trim())) picker.value = text.value.trim().toLowerCase();
  });
}

const urlFor = id => {
  for (const option of document.querySelectorAll('#image-ids option')) if (option.value === id) return option.dataset.url;
  return null;
};

for (const input of document.querySelectorAll('input[data-thumb]')) {
  input.addEventListener('change', () => {
    const current = input.parentElement.querySelector('.thumb');
    const url = urlFor(input.value.trim());
    let next;
    if (url) {
      next = document.createElement('img');
      next.className = 'thumb';
      next.alt = '';
      next.referrerPolicy = 'no-referrer';
      next.src = url;
    } else {
      next = document.createElement('span');
      next.className = 'thumb empty';
      next.textContent = input.value.trim() ? 'Unknown id' : 'No image';
    }
    current?.replaceWith(next);
  });
}

// 3. Licences tab: a "tick all shown" checkbox in the table header (the "Approve all shown" button works without JS).
for (const all of document.querySelectorAll('input[data-check-all]')) {
  const boxes = [...document.querySelectorAll('input[data-row-check]')];
  all.hidden = false;
  all.checked = boxes.length > 0 && boxes.every(box => box.checked);
  all.addEventListener('change', () => {
    for (const box of boxes) box.checked = all.checked;
  });
}
