const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderWatchOptions(access){
  if(!access.options?.length)return `<p class="watch-unconfirmed">${esc(access.line)}</p>`;
  return `<ul class="watch-options" aria-label="Available viewing methods">${access.options.map(option=>`<li class="watch-option ${option.kind}"><span class="watch-option-mark" aria-hidden="true"></span><div><strong>${esc(option.label)}</strong><span>${esc(option.detail)}</span></div></li>`).join('')}</ul>`;
}
