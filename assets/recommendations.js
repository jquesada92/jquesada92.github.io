(function () {
  'use strict';

  const DATA_URL = 'data/recommendations.json';

  const labels = {
    es: {
      loading: 'Cargando recomendaciones…',
      empty: 'No hay recomendaciones disponibles en este momento.',
      error: 'No fue posible cargar las recomendaciones.',
      client: 'Cliente',
      profile: 'Ver perfil en LinkedIn'
    },
    en: {
      loading: 'Loading recommendations…',
      empty: 'No recommendations are available at this time.',
      error: 'The recommendations could not be loaded.',
      client: 'Client',
      profile: 'View LinkedIn profile'
    }
  };

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === 'string') element.textContent = text;
    return element;
  }

  function initials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || 'L';
  }

  function extractDate(relationship) {
    const match = String(relationship || '').match(
      /^([A-Za-z]+\s+\d{1,2},\s+\d{4})/
    );
    return match ? match[1] : '';
  }

  function formatRelationship(item, lang) {
    const dateText = extractDate(item.relationship);
    if (!dateText) return labels[lang].client;

    const parsed = new Date(dateText + ' 00:00:00');
    if (Number.isNaN(parsed.getTime())) {
      return lang === 'es'
        ? labels.es.client
        : item.relationship || labels.en.client;
    }

    const formatted = new Intl.DateTimeFormat(
      lang === 'es' ? 'es-PA' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' }
    ).format(parsed);

    return labels[lang].client + ' · ' + formatted;
  }

  function createAvatar(item, lang) {
    const avatarLink = createElement('a', 'feedback-avatar-wrap');
    avatarLink.href = item.author_profile_url || '#';
    avatarLink.target = '_blank';
    avatarLink.rel = 'noopener noreferrer';
    avatarLink.setAttribute(
      'aria-label',
      labels[lang].profile + ': ' + (item.author_name || '')
    );

    const fallback = createElement(
      'span',
      'feedback-initials',
      initials(item.author_name)
    );
    avatarLink.appendChild(fallback);

    if (item.profile_image_url) {
      const image = createElement('img', 'feedback-avatar');
      image.src = item.profile_image_url;
      image.alt = item.author_name
        ? item.author_name + ' profile photo'
        : 'LinkedIn profile photo';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', function () {
        fallback.hidden = true;
      });
      image.addEventListener('error', function () {
        image.remove();
        fallback.hidden = false;
      });
      avatarLink.appendChild(image);
    }

    return avatarLink;
  }

  function buildCard(item, lang) {
    const article = createElement('article', 'feedback-card');
    const header = createElement('header', 'feedback-author');
    header.appendChild(createAvatar(item, lang));

    const details = createElement('div', 'feedback-author-details');
    const nameLink = createElement('a', 'feedback-name-link');
    nameLink.href = item.author_profile_url || '#';
    nameLink.target = '_blank';
    nameLink.rel = 'noopener noreferrer';
    nameLink.appendChild(
      createElement('strong', '', item.author_name || 'LinkedIn member')
    );

    details.appendChild(nameLink);
    details.appendChild(
      createElement('span', 'feedback-author-role', item.headline || '')
    );
    details.appendChild(
      createElement(
        'span',
        'feedback-relationship',
        formatRelationship(item, lang)
      )
    );

    header.appendChild(details);
    article.appendChild(header);
    article.appendChild(
      createElement(
        'blockquote',
        'feedback-quote',
        item.recommendation_text || ''
      )
    );

    return article;
  }

  function setStatus(container, message) {
    container.replaceChildren(createElement('p', 'feedback-status', message));
  }

  function render(container, recommendations, lang) {
    container.replaceChildren();
    const active = recommendations.filter(item => item.status !== 'removed');

    if (!active.length) {
      setStatus(container, labels[lang].empty);
      return;
    }

    active.forEach(item => container.appendChild(buildCard(item, lang)));
  }

  async function loadRecommendations() {
    const containers = Array.from(
      document.querySelectorAll('[data-feedback-lang]')
    );
    if (!containers.length) return;

    containers.forEach(container => {
      const lang = container.getAttribute('data-feedback-lang') === 'en'
        ? 'en'
        : 'es';
      setStatus(container, labels[lang].loading);
    });

    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);

      const payload = await response.json();
      const recommendations = Array.isArray(payload.recommendations)
        ? payload.recommendations
        : [];

      containers.forEach(container => {
        const lang = container.getAttribute('data-feedback-lang') === 'en'
          ? 'en'
          : 'es';
        render(container, recommendations, lang);
      });
    } catch (error) {
      console.error('Could not load LinkedIn recommendations:', error);
      containers.forEach(container => {
        const lang = container.getAttribute('data-feedback-lang') === 'en'
          ? 'en'
          : 'es';
        setStatus(container, labels[lang].error);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRecommendations, {
      once: true
    });
  } else {
    loadRecommendations();
  }
})();
