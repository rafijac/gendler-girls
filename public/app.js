/* Gendler Girls — public site.
 *
 * Data-driven: fetches GET /api/content ({ entities, settings }) and renders
 * every section from that response. No family copy is hardcoded here — only
 * UI chrome (nav labels, section headings, empty states, the draft banner).
 * If the API fails, a friendly error is shown and nothing invented is rendered.
 */
(function () {
  'use strict';

  /* UI chrome: section labels + default order (used only when settings
     omit section_order / section_visibility). */
  var SECTION_LABELS = {
    home: 'Home',
    'their-story': 'Their Story',
    testimonies: 'Testimonies',
    'their-legacy': 'Their Legacy',
    'public-appearances': 'Public Appearances',
    references: 'References',
    family: 'Family'
  };
  var DEFAULT_ORDER = [
    'home', 'their-story', 'testimonies', 'their-legacy',
    'public-appearances', 'references', 'family'
  ];

  /* ---------- small helpers ---------- */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function hasText(value) {
    return text(value).trim().length > 0;
  }

  /* Split body text into paragraphs on blank lines; single newlines inside
     a paragraph become line breaks (verbatim copy, including blanks/typos). */
  function paragraphs(body) {
    return text(body)
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(function (p) { return p.length > 0; });
  }

  function paragraphsHtml(body) {
    return paragraphs(body)
      .map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  /* Seeded photos carry "/images/..." paths; R2 uploads carry the full key
     ("uploads/<date>/<uuid>-<file>"), served at /uploads/<key>. */
  function imageUrl(key) {
    if (!hasText(key)) return '';
    var k = text(key).trim();
    return k.charAt(0) === '/' ? k : '/uploads/' + k;
  }

  function byPosition(a, b) {
    return (a.position || 0) - (b.position || 0);
  }

  function inSection(entities, section) {
    return entities
      .filter(function (e) { return e && e.data && e.data.section === section; })
      .sort(byPosition);
  }

  function ofType(list, type) {
    return list.filter(function (e) { return e.type === type; });
  }

  function emptyState(message) {
    return '<p class="empty-state">' + esc(message) + '</p>';
  }

  /* ---------- shared building blocks ---------- */

  function videoHtml(entity) {
    var d = entity.data || {};
    if (!hasText(d.youtube_id)) return '';
    var title = hasText(entity.title) ? entity.title : 'Video';
    var html = '<figure class="video">';
    html += '<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/' +
      esc(d.youtube_id) + '" title="' + esc(title) +
      '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>';
    if (hasText(d.description)) {
      html += '<figcaption>' + esc(d.description) + '</figcaption>';
    }
    html += '</figure>';
    return html;
  }

  function videoBlock(entity, headingLevel) {
    var html = '';
    if (hasText(entity.title)) {
      html += '<h' + headingLevel + ' class="item-title">' + esc(entity.title) + '</h' + headingLevel + '>';
    }
    html += videoHtml(entity);
    return html;
  }

  function photoFigure(entity) {
    var d = entity.data || {};
    var src = imageUrl(entity.image_key);
    if (!src) return '';
    var alt = hasText(d.alt) ? d.alt : (hasText(d.caption) ? d.caption : '');
    var html = '<figure class="photo"><img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">';
    if (hasText(d.caption)) {
      html += '<figcaption>' + esc(d.caption) + '</figcaption>';
    }
    html += '</figure>';
    return html;
  }

  /* A text_block: entity title as heading, body as paragraphs. */
  function textBlockHtml(entity, headingLevel) {
    var d = entity.data || {};
    var html = '<div class="text-block">';
    if (hasText(entity.title)) {
      html += '<h' + headingLevel + ' class="text-block-title">' + esc(entity.title) + '</h' + headingLevel + '>';
    }
    html += paragraphsHtml(d.body);
    html += '</div>';
    return html;
  }

  function textBlocksHtml(blocks, headingLevel) {
    return blocks.map(function (b) { return textBlockHtml(b, headingLevel); }).join('');
  }

  /* Match a text_block against keywords in its slug/title (lowercased). */
  function blockMatches(entity, keywords) {
    var key = ((entity.slug || '') + ' ' + (entity.title || '')).toLowerCase();
    return keywords.some(function (k) { return key.indexOf(k) !== -1; });
  }

  function sectionShell(slug, innerHtml, wide) {
    var label = SECTION_LABELS[slug] || slug;
    var html = '<section class="page-section" id="' + esc(slug) + '">';
    html += '<div class="section-inner' + (wide ? ' section-inner--wide' : '') + '">';
    if (slug !== 'home') {
      html += '<h2 class="section-title">' + esc(label) + '</h2>';
    }
    html += innerHtml;
    html += '</div></section>';
    return html;
  }

  /* ---------- Home ---------- */

  function renderHome(entities, settings) {
    var list = inSection(entities, 'home');
    var blocks = ofType(list, 'text_block');
    /* Don't repeat the hero image in the photo grid below the hero. */
    var heroSrc = imageUrl(settings.hero_image);
    var photos = ofType(list, 'photo').filter(function (p) {
      return !heroSrc || imageUrl(p.image_key) !== heroSrc;
    });
    var timeline = ofType(list, 'timeline_entry');
    var videos = ofType(list, 'video');

    /* Sort home text blocks into their named slots; anything unmatched is
       intro copy, rendered in position order rather than dropped. */
    var slots = { intro: [], preserving: [], ownWords: [], chaya: [], mission: [] };
    blocks.forEach(function (b) {
      if (blockMatches(b, ['preserv'])) slots.preserving.push(b);
      else if (blockMatches(b, ['chaya', 'did not survive'])) slots.chaya.push(b);
      else if (blockMatches(b, ['mission'])) slots.mission.push(b);
      else if (blockMatches(b, ['own words'])) slots.ownWords.push(b);
      else slots.intro.push(b);
    });

    var html = '';

    /* Hero */
    html += '<section class="hero page-section" id="home">';
    if (heroSrc) {
      html += '<img class="hero-img" src="' + esc(heroSrc) + '" alt="">';
    }
    html += '<div class="hero-text"><h1>' + esc(settings.site_title || 'The Gendler Girls') + '</h1>';
    if (hasText(settings.site_subtitle)) {
      html += '<p class="hero-subtitle">' + esc(settings.site_subtitle) + '</p>';
    }
    html += '</div></section>';

    /* Body of Home */
    var body = '<div class="section-inner">';

    if (slots.intro.length) {
      body += '<div class="subsection">' + textBlocksHtml(slots.intro, 2) + '</div>';
    }

    if (photos.length) {
      var figures = photos.map(photoFigure).filter(Boolean).join('');
      if (figures) {
        body += '<div class="subsection"><div class="photo-grid">' + figures + '</div></div>';
      }
    }

    if (timeline.length) {
      body += '<div class="subsection"><h2 class="subsection-title">The Timeline</h2><ol class="timeline">';
      timeline.forEach(function (entry) {
        var d = entry.data || {};
        body += '<li><span class="timeline-year">' + esc(d.year_label || entry.title || '') + '</span>';
        if (hasText(d.body)) {
          body += '<div class="timeline-body">' + paragraphsHtml(d.body) + '</div>';
        }
        body += '</li>';
      });
      body += '</ol></div>';
    }

    if (slots.preserving.length) {
      body += '<div class="subsection">' + textBlocksHtml(slots.preserving, 2) + '</div>';
    }

    /* In Their Own Words — featured video (settings) or home video entities. */
    var featuredId = text(settings.featured_video).trim();
    if (slots.ownWords.length || featuredId || videos.length) {
      body += '<div class="subsection">';
      if (slots.ownWords.length) {
        body += textBlocksHtml(slots.ownWords, 2);
      } else {
        body += '<h2 class="subsection-title">In Their Own Words</h2>';
      }
      if (featuredId) {
        body += videoHtml({ title: 'In Their Own Words', data: { youtube_id: featuredId } });
      } else {
        videos.forEach(function (v) { body += videoBlock(v, 3); });
      }
      body += '</div>';
    }

    if (slots.chaya.length) {
      body += '<div class="subsection">' + textBlocksHtml(slots.chaya, 2) + '</div>';
    }

    if (slots.mission.length) {
      body += '<div class="subsection">' + textBlocksHtml(slots.mission, 2) + '</div>';
    }

    if (hasText(settings.contact_note)) {
      body += '<div class="contact-block"><h2>Connect With Us</h2><p>' +
        esc(settings.contact_note) + '</p></div>';
    }

    body += '</div>';
    html += '<div class="page-section">' + body + '</div>';
    return html;
  }

  /* ---------- Their Story ---------- */

  function renderTheirStory(entities) {
    var list = inSection(entities, 'their-story');
    var blocks = ofType(list, 'text_block');
    var videos = ofType(list, 'video');
    var stories = ofType(list, 'story');

    var html = '';
    if (blocks.length) {
      html += '<div class="subsection">' + textBlocksHtml(blocks, 2) + '</div>';
    }

    videos.forEach(function (v) {
      html += '<div class="subsection">' + videoBlock(v, 3) + '</div>';
    });

    stories.forEach(function (s) {
      var d = s.data || {};
      html += '<div class="subsection">';
      if (hasText(s.title)) {
        html += '<h3 class="item-title">' + esc(s.title) + '</h3>';
      }
      if (hasText(d.body)) {
        html += paragraphsHtml(d.body);
      } else {
        /* Honest placeholder — never invented content. */
        var m = text(s.title).match(/^(.+?)'s Story$/);
        var placeholder = m
          ? m[1] + '\u2019s written story has not been added yet.'
          : (hasText(s.title) ? s.title + ' has not been added yet.'
                              : 'This story has not been added yet.');
        html += emptyState(placeholder);
      }
      html += '</div>';
    });

    if (!blocks.length && !videos.length && !stories.length) {
      html += emptyState('Their story has not been added yet.');
    }
    return sectionShell('their-story', html, false);
  }

  /* ---------- Testimonies ---------- */

  function renderTestimonies(entities) {
    var list = inSection(entities, 'testimonies');
    var blocks = ofType(list, 'text_block');
    var videos = ofType(list, 'video');

    var html = '';
    if (blocks.length) {
      html += '<div class="subsection">' + textBlocksHtml(blocks, 2) + '</div>';
    }
    videos.forEach(function (v) {
      html += '<div class="subsection">' + videoBlock(v, 3) + '</div>';
    });
    if (!blocks.length && !videos.length) {
      html += emptyState('No testimonies have been added yet.');
    }
    return sectionShell('testimonies', html, false);
  }

  /* ---------- Their Legacy ---------- */

  function renderLegacy(entities) {
    var list = inSection(entities, 'their-legacy');
    var blocks = ofType(list, 'text_block');
    var albums = ofType(list, 'album');
    var photos = ofType(list, 'photo');
    var videos = ofType(list, 'video');
    var speeches = ofType(list, 'speech');
    var notes = ofType(list, 'note_page');

    /* Legacy text blocks: Joel's intro goes with Joel's Notes, a speeches
       intro goes with the speeches, anything else leads the section. */
    var joelIntro = [];
    var speechesIntro = [];
    var generalIntro = [];
    blocks.forEach(function (b) {
      if (blockMatches(b, ['joel'])) joelIntro.push(b);
      else if (blockMatches(b, ['speech', 'leviah', 'levayah'])) speechesIntro.push(b);
      else generalIntro.push(b);
    });

    var html = '';
    if (generalIntro.length) {
      html += '<div class="subsection">' + textBlocksHtml(generalIntro, 2) + '</div>';
    }

    /* Albums + their photos (photo.album === album.slug; title match as fallback). */
    var usedPhotos = {};
    var usedVideos = {};
    if (albums.length) {
      html += '<div class="subsection"><h2 class="subsection-title">Family Albums</h2>';
      albums.forEach(function (album) {
        var d = album.data || {};
        html += '<div class="album">';
        if (hasText(album.title)) {
          html += '<h3 class="item-title">' + esc(album.title) + '</h3>';
        }
        if (hasText(d.description)) {
          html += '<p class="album-description">' + esc(d.description) + '</p>';
        }
        var albumPhotos = photos.filter(function (p) {
          return p.album === album.slug || (hasText(album.title) && p.album === album.title);
        });
        albumPhotos.forEach(function (p) { usedPhotos[p.id] = true; });
        var figures = albumPhotos.map(photoFigure).filter(Boolean).join('');
        if (figures) {
          html += '<div class="photo-grid">' + figures + '</div>';
        } else {
          html += emptyState('No photos have been added to this album yet.');
        }
        var albumVideos = videos.filter(function (v) {
          return v.album === album.slug || (hasText(album.title) && v.album === album.title);
        });
        albumVideos.forEach(function (v) {
          usedVideos[v.id] = true;
          html += videoBlock(v, 3);
        });
        html += '</div>';
      });
      html += '</div>';
    }

    /* Legacy photos/videos not assigned to any album. */
    var unassignedPhotos = photos.filter(function (p) { return !usedPhotos[p.id]; });
    var unassignedVideos = videos.filter(function (v) { return !usedVideos[v.id]; });
    if (unassignedPhotos.length || unassignedVideos.length) {
      html += '<div class="subsection">';
      if (!albums.length && unassignedPhotos.length) {
        html += '<h2 class="subsection-title">Family Albums</h2>';
      }
      var extraFigures = unassignedPhotos.map(photoFigure).filter(Boolean).join('');
      if (extraFigures) {
        html += '<div class="photo-grid">' + extraFigures + '</div>';
      }
      unassignedVideos.forEach(function (v) { html += videoBlock(v, 3); });
      html += '</div>';
    }

    /* Speeches in full. */
    if (speechesIntro.length || speeches.length) {
      html += '<div class="subsection">';
      if (speechesIntro.length) {
        html += textBlocksHtml(speechesIntro, 2);
      } else if (speeches.length) {
        html += '<h2 class="subsection-title">Speeches</h2>';
      }
      speeches.forEach(function (s) {
        var d = s.data || {};
        html += '<article class="speech">';
        if (hasText(s.title)) {
          html += '<h3 class="item-title">' + esc(s.title) + '</h3>';
        }
        var meta = [];
        if (hasText(d.author)) meta.push(d.author);
        if (hasText(d.role)) meta.push(d.role);
        if (hasText(d.date)) meta.push(d.date);
        if (meta.length) {
          html += '<p class="speech-meta">' + esc(meta.join(' \u00b7 ')) + '</p>';
        }
        html += paragraphsHtml(d.body);
        html += '</article>';
      });
      html += '</div>';
    }

    /* Joel's Notes. */
    html += '<div class="subsection">';
    if (joelIntro.length) {
      html += textBlocksHtml(joelIntro, 2);
    } else {
      html += '<h2 class="subsection-title">Joel\u2019s Notes</h2>';
    }
    if (notes.length) {
      notes.forEach(function (n) {
        var d = n.data || {};
        html += '<div class="note-page">';
        var fig = photoFigure(n);
        html += fig ? '<div class="note-photo">' + fig + '</div>' : '<div></div>';
        html += '<div class="note-transcription">';
        if (hasText(n.title)) {
          html += '<h4>' + esc(n.title) + '</h4>';
        }
        if (hasText(d.transcription)) {
          html += paragraphsHtml(d.transcription);
        } else {
          html += emptyState('This page has not been transcribed yet.');
        }
        html += '</div></div>';
      });
    } else {
      html += emptyState('Joel\u2019s notebook pages have not been added yet.');
    }
    html += '</div>';

    return sectionShell('their-legacy', html, true);
  }

  /* ---------- Public Appearances ---------- */

  function renderAppearances(entities) {
    var list = inSection(entities, 'public-appearances');
    var blocks = ofType(list, 'text_block');
    var items = ofType(list, 'appearance');

    var html = '';
    if (blocks.length) {
      html += '<div class="subsection">' + textBlocksHtml(blocks, 2) + '</div>';
    }
    items.forEach(function (a) {
      var d = a.data || {};
      html += '<div class="appearance">';
      if (hasText(a.title)) {
        html += '<h3 class="item-title">' + esc(a.title) + '</h3>';
      }
      var meta = [];
      if (hasText(d.date_label)) meta.push(d.date_label);
      if (hasText(d.place)) meta.push(d.place);
      if (meta.length) {
        html += '<p class="appearance-meta">' + esc(meta.join(' \u00b7 ')) + '</p>';
      }
      html += paragraphsHtml(d.body);
      html += '</div>';
    });
    if (!blocks.length && !items.length) {
      html += emptyState('No public appearances have been added yet.');
    }
    return sectionShell('public-appearances', html, false);
  }

  /* ---------- References ---------- */

  function renderReferences(entities) {
    var list = inSection(entities, 'references');
    var blocks = ofType(list, 'text_block');
    var refs = ofType(list, 'reference');
    var videos = ofType(list, 'video');
    var photos = ofType(list, 'photo');

    var html = '';
    if (blocks.length) {
      html += '<div class="subsection">' + textBlocksHtml(blocks, 2) + '</div>';
    }

    /* A reference may carry the same youtube_id as a video entity in this
       section (seeded AP footage does) — embed each video only once. The
       video entity wins: it carries the title and description. */
    var videoIds = {};
    videos.forEach(function (v) { videoIds[(v.data || {}).youtube_id] = true; });
    var embeddedVideos = {};
    refs.forEach(function (r) {
      var d = r.data || {};
      html += '<div class="reference">';
      if (hasText(r.title)) {
        html += '<h3 class="item-title">' + esc(r.title) + '</h3>';
      }
      html += paragraphsHtml(d.body);
      if (hasText(d.youtube_id) && !videoIds[d.youtube_id] && !embeddedVideos[d.youtube_id]) {
        html += videoHtml(r);
        embeddedVideos[d.youtube_id] = true;
      }
      if (hasText(d.image)) {
        html += photoFigure({ image_key: d.image, data: { alt: r.title || '' } });
      }
      html += '</div>';
    });

    videos.forEach(function (v) {
      var d = v.data || {};
      if (embeddedVideos[d.youtube_id]) return;
      embeddedVideos[d.youtube_id] = true;
      html += '<div class="subsection">' + videoBlock(v, 3) + '</div>';
    });

    if (photos.length) {
      var figures = photos.map(photoFigure).filter(Boolean).join('');
      if (figures) {
        html += '<div class="subsection"><div class="photo-grid">' + figures + '</div></div>';
      }
    }

    if (!blocks.length && !refs.length && !videos.length && !photos.length) {
      html += emptyState('No references have been added yet.');
    }
    return sectionShell('references', html, true);
  }

  /* ---------- Family ---------- */

  function renderFamily(entities) {
    var list = inSection(entities, 'family');
    var blocks = ofType(list, 'text_block');
    var stories = ofType(list, 'story');

    var html = '';
    if (blocks.length) {
      html += '<div class="subsection">' + textBlocksHtml(blocks, 2) + '</div>';
    }
    stories.forEach(function (s) {
      var d = s.data || {};
      html += '<div class="subsection">';
      if (d.draft) {
        html += '<div class="draft-banner" role="note"><strong>Draft</strong> \u2014 ' +
          'this biography is unfinished: it has blank fields and has not been reviewed.</div>';
      }
      if (hasText(s.title)) {
        html += '<h3 class="item-title">' + esc(s.title) + '</h3>';
      }
      if (hasText(d.body)) {
        /* Verbatim: blanks and typos intact. */
        html += paragraphsHtml(d.body);
      } else {
        html += emptyState('This biography has not been added yet.');
      }
      html += '</div>';
    });
    if (!blocks.length && !stories.length) {
      html += emptyState('No family pages have been added yet.');
    }
    return sectionShell('family', html, false);
  }

  /* ---------- Generic fallback for any other section slug ---------- */

  function renderGeneric(entities, slug) {
    var list = inSection(entities, slug);
    var html = '';
    list.forEach(function (e) {
      var d = e.data || {};
      if (e.type === 'text_block') {
        html += '<div class="subsection">' + textBlockHtml(e, 2) + '</div>';
      } else if (e.type === 'photo') {
        html += '<div class="subsection">' + photoFigure(e) + '</div>';
      } else if (e.type === 'video') {
        html += '<div class="subsection">' + videoBlock(e, 3) + '</div>';
      } else if (e.type === 'story') {
        html += '<div class="subsection">';
        if (hasText(e.title)) html += '<h3 class="item-title">' + esc(e.title) + '</h3>';
        html += paragraphsHtml(d.body);
        html += '</div>';
      } else if (e.type === 'speech') {
        html += '<div class="subsection"><article class="speech">';
        if (hasText(e.title)) html += '<h3 class="item-title">' + esc(e.title) + '</h3>';
        html += paragraphsHtml(d.body);
        html += '</article></div>';
      } else if (e.type === 'timeline_entry') {
        html += '<div class="subsection"><h3 class="item-title">' +
          esc(d.year_label || e.title || '') + '</h3>' + paragraphsHtml(d.body) + '</div>';
      } else if (e.type === 'reference') {
        html += '<div class="subsection">';
        if (hasText(e.title)) html += '<h3 class="item-title">' + esc(e.title) + '</h3>';
        html += paragraphsHtml(d.body);
        html += '</div>';
      } else if (e.type === 'appearance') {
        html += '<div class="subsection">';
        if (hasText(e.title)) html += '<h3 class="item-title">' + esc(e.title) + '</h3>';
        html += paragraphsHtml(d.body);
        html += '</div>';
      } else if (e.type === 'note_page') {
        html += '<div class="subsection">' + photoFigure(e) + paragraphsHtml(d.transcription) + '</div>';
      } else if (e.type === 'album') {
        html += '<div class="subsection">';
        if (hasText(e.title)) html += '<h3 class="item-title">' + esc(e.title) + '</h3>';
        if (hasText(d.description)) html += '<p class="album-description">' + esc(d.description) + '</p>';
        html += '</div>';
      }
    });
    if (!list.length) {
      html += emptyState('Nothing has been added to this section yet.');
    }
    return sectionShell(slug, html, false);
  }

  /* ---------- Top-level render ---------- */

  var RENDERERS = {
    home: renderHome,
    'their-story': renderTheirStory,
    testimonies: renderTestimonies,
    'their-legacy': renderLegacy,
    'public-appearances': renderAppearances,
    references: renderReferences,
    family: renderFamily
  };

  function render(payload) {
    var entities = Array.isArray(payload.entities) ? payload.entities : [];
    var settings = payload.settings || {};

    /* Theme: a class on <html> so presets can be added later. */
    var theme = text(settings.theme).trim() || 'warm';
    document.documentElement.className =
      document.documentElement.className.replace(/\btheme-\S+/g, '').trim();
    document.documentElement.classList.add('theme-' + theme.replace(/[^a-z0-9-]/gi, ''));

    var siteTitle = text(settings.site_title).trim() || 'The Gendler Girls';
    document.title = siteTitle;

    /* Section order + visibility come from settings; fall back to defaults. */
    var order = Array.isArray(settings.section_order) && settings.section_order.length
      ? settings.section_order.slice()
      : DEFAULT_ORDER.slice();
    /* Any known section missing from a custom order still renders, appended. */
    DEFAULT_ORDER.forEach(function (slug) {
      if (order.indexOf(slug) === -1) order.push(slug);
    });
    var visibility = settings.section_visibility || {};
    var visibleSections = order.filter(function (slug) {
      return visibility[slug] !== false;
    });

    /* Nav */
    var nav = document.getElementById('site-nav');
    nav.innerHTML = visibleSections.map(function (slug) {
      var label = SECTION_LABELS[slug] || slug.replace(/-/g, ' ');
      return '<a href="#' + esc(slug) + '">' + esc(label) + '</a>';
    }).join('');

    /* Sections */
    var app = document.getElementById('app');
    var html = visibleSections.map(function (slug) {
      var renderer = RENDERERS[slug] || function (ents) { return renderGeneric(ents, slug); };
      return renderer(entities, settings);
    }).join('');
    app.innerHTML = html || emptyState('No content has been added yet.');

    /* Footer */
    var footer = document.getElementById('site-footer');
    var footerHtml = '<div class="footer-title">' + esc(siteTitle) + '</div>';
    if (hasText(settings.contact_note)) {
      footerHtml += '<p>' + esc(settings.contact_note) + '</p>';
    }
    footerHtml += '<p class="footer-admin"><a href="/admin/">Family admin</a></p>';
    footer.innerHTML = footerHtml;
  }

  function renderError() {
    var app = document.getElementById('app');
    app.innerHTML =
      '<div class="error-state"><h1>We couldn\u2019t load the site just now</h1>' +
      '<p>Something went wrong while loading the memorial. Please refresh the page ' +
      'or try again in a little while.</p></div>';
    document.getElementById('site-nav').innerHTML = '';
  }

  async function init() {
    try {
      var response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var payload = await response.json();
      if (!payload || !Array.isArray(payload.entities)) throw new Error('Bad payload');
      render(payload);
    } catch (err) {
      renderError();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
