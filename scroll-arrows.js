// Utilitaire generique : ajoute des fleches de scroll haut/bas dynamiques
// autour de n'importe quel element scrollable, sans etre efface par les
// futurs remplacements de innerHTML de cet element.
function attachScrollArrows(el) {
  if (!el || el.dataset.scrollArrowsAttached === "true") return;
  el.dataset.scrollArrowsAttached = "true";

  const wrapper = document.createElement("div");
  wrapper.className = "scroll-arrows-wrap";
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "scroll-arrow scroll-arrow-up";
  upBtn.innerHTML = "▲";
  upBtn.setAttribute("aria-label", "Défiler vers le haut");
  upBtn.hidden = true;

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "scroll-arrow scroll-arrow-down";
  downBtn.innerHTML = "▼";
  downBtn.setAttribute("aria-label", "Défiler vers le bas");
  downBtn.hidden = true;

  wrapper.appendChild(upBtn);
  wrapper.appendChild(downBtn);

  function updateArrows() {
    const canUp = el.scrollTop > 4;
    const canDown = el.scrollTop < el.scrollHeight - el.clientHeight - 4;
    upBtn.hidden = !canUp;
    downBtn.hidden = !canDown;
  }

  upBtn.addEventListener("click", () => {
    el.scrollBy({ top: -Math.round(el.clientHeight * 0.6), behavior: "smooth" });
  });
  downBtn.addEventListener("click", () => {
    el.scrollBy({ top: Math.round(el.clientHeight * 0.6), behavior: "smooth" });
  });

  el.addEventListener("scroll", updateArrows);
  const mo = new MutationObserver(() => requestAnimationFrame(updateArrows));
  mo.observe(el, { childList: true, subtree: false });
  window.addEventListener("resize", updateArrows);
  requestAnimationFrame(updateArrows);
}

window.ScrollArrows = { attachScrollArrows };
