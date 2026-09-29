import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const ADDON_ROUTES = new Set(['support', 'admin']);
let currentUser = null;
let adminAccess = false;
let db = null;
let auth = null;
let rendering = false;

function lang() {
  return localStorage.getItem('tc_lang') === 'ar' || document.documentElement.lang === 'ar' ? 'ar' : 'en';
}

function t(en, ar) {
  return lang() === 'ar' ? ar : en;
}

function route() {
  return (location.hash || '#home').slice(1).split('?')[0];
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => box.classList.remove('show'), 2600);
}

function formatDate(value, fallback = '') {
  try {
    if (value?.toDate) return value.toDate().toLocaleString(lang() === 'ar' ? 'ar-JO' : 'en-GB');
    if (fallback) return new Date(fallback).toLocaleString(lang() === 'ar' ? 'ar-JO' : 'en-GB');
  } catch (_) { }
  return t('Just now', 'الآن');
}

function makePage(title, subtitle, body, key) {
  return `
    <main class="page" data-addon-page="${key}">
      <div class="content">
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
        ${body}
      </div>
    </main>`;
}

function replacePage(html, key, force = false) {
  const shell = document.querySelector('#app .app-shell');
  const page = shell?.querySelector('.page');
  if (!shell || !page) return false;
  if (page.dataset.addonPage === key && !force) return true;
  page.outerHTML = html;
  return true;
}

function setActiveNav(key) {
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.querySelector(`.nav-link[href="#${key}"]`)?.classList.add('active');
}

function ensureNavigation() {
  const nav = document.querySelector('.header .nav');
  if (!nav) return;

  if (!nav.querySelector('[data-addon-nav="support"]')) {
    const link = document.createElement('a');
    link.href = '#support';
    link.className = 'nav-link';
    link.dataset.addonNav = 'support';
    link.textContent = t('Support', 'الدعم');
    const profile = nav.querySelector('a[href="#profile"]');
    profile ? nav.insertBefore(link, profile) : nav.appendChild(link);
  }

  const oldAdmin = nav.querySelector('[data-addon-nav="admin"]');
  if (adminAccess && !oldAdmin) {
    const link = document.createElement('a');
    link.href = '#admin';
    link.className = 'nav-link';
    link.dataset.addonNav = 'admin';
    link.textContent = t('Admin', 'الإدارة');
    const profile = nav.querySelector('a[href="#profile"]');
    profile ? nav.insertBefore(link, profile) : nav.appendChild(link);
  } else if (!adminAccess && oldAdmin) {
    oldAdmin.remove();
  }

  const supportLink = nav.querySelector('[data-addon-nav="support"]');
  const supportLabel = t('Support', 'الدعم');

  if (supportLink && supportLink.textContent !== supportLabel) {
    supportLink.textContent = supportLabel;
  }

  const adminLink = nav.querySelector('[data-addon-nav="admin"]');
  const adminLabel = t('Admin', 'الإدارة');

  if (adminLink && adminLink.textContent !== adminLabel) {
    adminLink.textContent = adminLabel;
  }
}

function ensureHomeSupportCard() {
  if (route() !== 'home') return;
  const page = document.querySelector('#app .page');
  if (!page || page.dataset.addonPage) return;
  if (page.querySelector('[data-addon-home-support]')) return;

  const cards = page.querySelector('.cards');
  if (!cards) return;

  const card = document.createElement('a');
  card.href = '#support';
  card.className = 'card olive-soft';
  card.dataset.addonHomeSupport = '1';
  card.innerHTML = `
    <div class="card-title">${t('Contact & Support', 'التواصل والدعم')}</div>
    <div class="card-copy">${t('Send a support request, follow its status, or read common help topics.', 'أرسل طلب دعم وتابع حالته أو اطلع على الأسئلة الشائعة.')}</div>
    <div class="card-action">${t('Open Support', 'فتح الدعم')} →</div>`;
  cards.appendChild(card);
}


function ensureProfileShortcuts() {
  if (route() !== 'profile') return;
  const page = document.querySelector('#app .page');
  if (!page || page.dataset.addonPage) return;
  const cards = page.querySelector('.cards');
  if (!cards) return;

  if (!cards.querySelector('[data-addon-profile-support]')) {
    const link = document.createElement('a');
    link.href = '#support';
    link.className = 'card olive-soft';
    link.dataset.addonProfileSupport = '1';
    link.innerHTML = `
      <div class="card-title">${t('Contact & Support', 'التواصل والدعم')}</div>
      <div class="card-copy">${t('Open help topics and follow your support requests.', 'افتح المساعدة وتابع طلبات الدعم الخاصة بك.')}</div>
      <div class="card-action">${t('Open Support', 'فتح الدعم')} →</div>`;
    cards.appendChild(link);
  }

  const existingAdmin = cards.querySelector('[data-addon-profile-admin]');
  if (adminAccess && !existingAdmin) {
    const link = document.createElement('a');
    link.href = '#admin';
    link.className = 'card peach';
    link.dataset.addonProfileAdmin = '1';
    link.innerHTML = `
      <div class="card-title">${t('Admin Dashboard', 'لوحة الإدارة')}</div>
      <div class="card-copy">${t('Manage support requests, users, and community stories.', 'أدر طلبات الدعم والمستخدمين وقصص المجتمع.')}</div>
      <div class="card-action">${t('Open Dashboard', 'فتح لوحة الإدارة')} →</div>`;
    cards.appendChild(link);
  } else if (!adminAccess && existingAdmin) {
    existingAdmin.remove();
  }
}

function ensureSupportFab() {
  let fab = document.querySelector('.support-fab');
  if (route() === 'support' || route() === 'admin') {
    fab?.remove();
    return;
  }
  if (!fab) {
    fab = document.createElement('a');
    fab.href = '#support';
    fab.className = 'support-fab';
    fab.setAttribute('aria-label', t('Open Support', 'فتح الدعم'));
    fab.innerHTML = `<span aria-hidden="true">?</span><b>${t('Support', 'الدعم')}</b>`;
    document.body.appendChild(fab);
  } else {
    fab.setAttribute('aria-label', t('Open Support', 'فتح الدعم'));
    const label = fab.querySelector('b');
    if (label) label.textContent = t('Support', 'الدعم');
  }
}

function supportForm() {
  if (!currentUser) {
    return `
      <div class="callout peach">
        <h3>${t('Sign in to contact support', 'سجّل الدخول للتواصل مع الدعم')}</h3>
        <p>${t('The help topics are available to everyone. Sign in when you want to create and track a support ticket.', 'الأسئلة الشائعة متاحة للجميع. سجّل الدخول عندما تريد إنشاء طلب دعم ومتابعته.')}</p>
        <div class="btn-row" style="margin-top:14px">
          <a class="btn" href="#login">${t('Sign In', 'تسجيل الدخول')}</a>
        </div>
      </div>`;
  }

  const name = currentUser.displayName || '';
  const email = currentUser.email || '';

  return `
    <section class="card" style="margin-bottom:22px">
      <div class="card-title">${t('Send a Support Request', 'إرسال طلب دعم')}</div>
      <div class="card-copy">${t('Tell us what happened and the request will be saved to your account.', 'أخبرنا بالمشكلة وسيتم حفظ الطلب في حسابك.')}</div>
      <form id="support-ticket-form" class="form">
        <div class="two-col">
          <div class="field">
            <label>${t('Name', 'الاسم')}</label>
            <input class="input" name="name" maxlength="80" required value="${escapeHtml(name)}">
          </div>
          <div class="field">
            <label>${t('Email', 'البريد الإلكتروني')}</label>
            <input class="input" name="email" type="email" maxlength="120" required value="${escapeHtml(email)}">
          </div>
        </div>
        <div class="two-col">
          <div class="field">
            <label>${t('Category', 'نوع الطلب')}</label>
            <select class="select" name="category" required>
              <option value="Technical">${t('Technical issue', 'مشكلة تقنية')}</option>
              <option value="Account">${t('Account & login', 'الحساب وتسجيل الدخول')}</option>
              <option value="Trip">${t('Trip planning', 'تخطيط الرحلات')}</option>
              <option value="Story">${t('Stories', 'القصص')}</option>
              <option value="Other">${t('Other', 'أخرى')}</option>
            </select>
          </div>
          <div class="field">
            <label>${t('Subject', 'الموضوع')}</label>
            <input class="input" name="subject" maxlength="100" required>
          </div>
        </div>
        <div class="field">
          <label>${t('Message', 'الرسالة')}</label>
          <textarea class="textarea" name="message" maxlength="1500" required></textarea>
        </div>
        <div class="btn-row">
          <button class="btn" type="submit">${t('Send Request', 'إرسال الطلب')}</button>
        </div>
      </form>
    </section>`;
}

function faqSection() {
  const items = [
    [t('How do I create a trip?', 'كيف أنشئ رحلة؟'), t('Open Plan Trip and choose the smart planner or the manual planner.', 'افتح خطط الرحلة واختر المخطط الذكي أو التخطيط اليدوي.')],
    [t('How do I save my trip?', 'كيف أحفظ رحلتي؟'), t('Sign in, create your itinerary, then save it to My Trips.', 'سجّل الدخول وأنشئ خطتك ثم احفظها في رحلاتي.')],
    [t('How does Scan Landmark work?', 'كيف يعمل مسح المعلم؟'), t('On a phone, open Scan Landmark and capture one of the registered landmarks.', 'على الهاتف افتح مسح المعلم والتقط صورة لأحد المعالم المسجلة.')],
    [t('How do I change the language?', 'كيف أغير اللغة؟'), t('Use the EN / AR button in the top navigation.', 'استخدم زر EN / AR في شريط التنقل العلوي.')],
    [t('How do I publish a story?', 'كيف أنشر قصة؟'), t('Open Stories, choose Share Story, complete the form, and publish it.', 'افتح القصص ثم اختر مشاركة قصة وأكمل النموذج وانشرها.')],
    [t('Where can I see my support requests?', 'أين أجد طلبات الدعم الخاصة بي؟'), t('Your requests appear on this page after you sign in.', 'تظهر طلباتك في هذه الصفحة بعد تسجيل الدخول.')]
  ];

  return `
    <section style="margin-bottom:22px">
      <h2>${t('Frequently Asked Questions', 'الأسئلة الشائعة')}</h2>
      <div class="cards">
        ${items.map(([q, a]) => `<article class="card"><div class="card-title">${q}</div><div class="card-copy">${a}</div></article>`).join('')}
      </div>
    </section>`;
}

function ticketsPlaceholder() {
  if (!currentUser) return '';
  return `
    <section>
      <h2>${t('My Support Requests', 'طلبات الدعم الخاصة بي')}</h2>
      <div id="my-support-tickets" class="callout"><p>${t('Loading your requests…', 'جاري تحميل طلباتك…')}</p></div>
    </section>`;
}

function supportPageHtml() {
  return makePage(
    t('Contact & Support', 'التواصل والدعم'),
    t('Help, common questions, and support requests in one place.', 'المساعدة والأسئلة الشائعة وطلبات الدعم في مكان واحد.'),
    `${supportForm()}${faqSection()}${ticketsPlaceholder()}`,
    'support'
  );
}

function statusLabel(status) {
  const map = {
    Open: t('Open', 'مفتوح'),
    'In Progress': t('In Progress', 'قيد المعالجة'),
    Resolved: t('Resolved', 'تم الحل'),
    Closed: t('Resolved', 'تم الحل')
  };
  return map[status] || escapeHtml(status || 'Open');
}

function ticketCard(ticket, admin = false) {
  const d = ticket.data;
  return `
    <article class="card" data-ticket-id="${escapeHtml(ticket.id)}">
      <div class="btn-row" style="justify-content:space-between;align-items:center">
        <div class="card-title">${escapeHtml(d.subject || t('Support Request', 'طلب دعم'))}</div>
        <span class="chip">${statusLabel(d.status)}</span>
      </div>
      <div class="card-copy"><strong>${escapeHtml(d.category || '')}</strong> · ${formatDate(d.createdAt, d.createdAtText)}</div>
      ${admin ? `<div class="card-copy">${escapeHtml(d.name || '')} · ${escapeHtml(d.email || '')}</div>` : ''}
      <div class="card-copy">${escapeHtml(d.message || '')}</div>
      ${d.adminReply ? `<div class="callout olive-soft"><h3>${t('Support Reply', 'رد الدعم')}</h3><p>${escapeHtml(d.adminReply)}</p></div>` : ''}
      ${admin ? `
        <div class="field">
          <label>${t('Reply', 'الرد')}</label>
          <textarea class="textarea admin-reply" maxlength="1500">${escapeHtml(d.adminReply || '')}</textarea>
        </div>
        <div class="btn-row">
          <button class="btn small olive" data-ticket-action="reply">${t('Save Reply', 'حفظ الرد')}</button>
          <button class="btn small secondary" data-ticket-status="Open">${t('Open', 'مفتوح')}</button>
          <button class="btn small secondary" data-ticket-status="In Progress">${t('In Progress', 'قيد المعالجة')}</button>
          <button class="btn small secondary" data-ticket-status="Resolved">${t('Resolve', 'تم الحل')}</button>
        </div>` : ''}
    </article>`;
}

async function loadMyTickets() {
  const target = document.getElementById('my-support-tickets');
  if (!target || !currentUser || !db) return;

  try {
    const ticketQuery = query(collection(db, 'supportTickets'), where('ownerId', '==', currentUser.uid));
    const snapshot = await getDocs(ticketQuery);
    const tickets = snapshot.docs
      .map(item => ({ id: item.id, data: item.data() }))
      .sort((a, b) => String(b.data.createdAtText || '').localeCompare(String(a.data.createdAtText || '')));

    if (!tickets.length) {
      target.innerHTML = `<p>${t('You have not sent any support requests yet.', 'لم ترسل أي طلب دعم حتى الآن.')}</p>`;
      return;
    }

    target.className = 'cards';
    target.innerHTML = tickets.map(item => ticketCard(item)).join('');
  } catch (error) {
    console.error('Could not load support requests:', error);
    target.innerHTML = `<p>${t('Could not load your support requests.', 'تعذر تحميل طلبات الدعم الخاصة بك.')}</p>`;
  }
}

function bindSupportForm() {
  const form = document.getElementById('support-ticket-form');
  if (!form || !currentUser || !db) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      const data = new FormData(form);
      const now = new Date().toISOString();
      await addDoc(collection(db, 'supportTickets'), {
        ownerId: currentUser.uid,
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim().toLowerCase(),
        category: String(data.get('category') || 'Other'),
        subject: String(data.get('subject') || '').trim(),
        message: String(data.get('message') || '').trim(),
        status: 'Open',
        adminReply: '',
        createdAt: serverTimestamp(),
        createdAtText: now,
        updatedAt: serverTimestamp()
      });

      form.reset();
      form.querySelector('[name="name"]').value = currentUser.displayName || '';
      form.querySelector('[name="email"]').value = currentUser.email || '';
      showToast(t('Your support request was sent.', 'تم إرسال طلب الدعم.'));
      await loadMyTickets();
    } catch (error) {
      console.error('Support request failed:', error);
      showToast(t('Could not send the request. Please try again.', 'تعذر إرسال الطلب. حاول مرة أخرى.'));
    } finally {
      button.disabled = false;
    }
  });
}

async function renderSupport(force = false) {
  const existing = document.querySelector('[data-addon-page="support"]');
  if (existing && !force) {
    setActiveNav('support');
    return;
  }
  if (!replacePage(supportPageHtml(), 'support', force)) return;
  setActiveNav('support');
  bindSupportForm();
  await loadMyTickets();
}

function adminPageHtml() {
  if (!currentUser) {
    return makePage(
      t('Admin Dashboard', 'لوحة الإدارة'),
      t('Administrative access is restricted.', 'الوصول الإداري مقيّد.'),
      `<div class="callout peach"><h3>${t('Sign in required', 'يلزم تسجيل الدخول')}</h3><p>${t('Sign in with an administrator account to continue.', 'سجّل الدخول بحساب إداري للمتابعة.')}</p><div class="btn-row" style="margin-top:14px"><a class="btn" href="#login">${t('Sign In', 'تسجيل الدخول')}</a></div></div>`,
      'admin'
    );
  }

  if (!adminAccess) {
    return makePage(
      t('Admin Dashboard', 'لوحة الإدارة'),
      t('Administrative access is restricted.', 'الوصول الإداري مقيّد.'),
      `<div class="callout peach"><h3>${t('Access denied', 'غير مصرح بالدخول')}</h3><p>${t('This account is not registered as an administrator.', 'هذا الحساب غير مسجل كحساب إداري.')}</p></div>`,
      'admin'
    );
  }

  return makePage(
    t('Admin Dashboard', 'لوحة الإدارة'),
    t('Review support requests and moderate community stories.', 'راجع طلبات الدعم وأدر قصص المجتمع.'),
    `<section class="profile-stats admin-stats-grid" id="admin-stats">
       <div class="profile-stat">${t('Users', 'المستخدمون')}<strong>—</strong></div>
       <div class="profile-stat">${t('Open Tickets', 'الطلبات المفتوحة')}<strong>—</strong></div>
       <div class="profile-stat">${t('In Progress', 'قيد المعالجة')}<strong>—</strong></div>
       <div class="profile-stat">${t('Resolved', 'تم حلها')}<strong>—</strong></div>
       <div class="profile-stat">${t('Stories', 'القصص')}<strong>—</strong></div>
     </section>
     <section style="margin-top:22px">
       <h2>${t('Support Requests', 'طلبات الدعم')}</h2>
       <div id="admin-tickets" class="callout"><p>${t('Loading support requests…', 'جاري تحميل طلبات الدعم…')}</p></div>
     </section>
     <section style="margin-top:22px">
       <h2>${t('Registered Users', 'المستخدمون المسجلون')}</h2>
       <div id="admin-users" class="callout"><p>${t('Loading users…', 'جاري تحميل المستخدمين…')}</p></div>
     </section>
     <section style="margin-top:22px">
       <h2>${t('Community Stories', 'قصص المجتمع')}</h2>
       <div id="admin-stories" class="callout"><p>${t('Loading stories…', 'جاري تحميل القصص…')}</p></div>
     </section>`,
    'admin'
  );
}

function storyAdminCard(item) {
  const d = item.data;
  return `
    <article class="card" data-story-id="${escapeHtml(item.id)}">
      <div class="card-title">${escapeHtml(d.title || t('Untitled Story', 'قصة بدون عنوان'))}</div>
      <div class="card-copy">${escapeHtml(d.authorName || t('Traveler', 'مسافر'))} · ${escapeHtml(d.location || '')}</div>
      <div class="card-copy">${t('Rating', 'التقييم')}: ${escapeHtml(d.rating || '')}/5</div>
      <div class="btn-row">
        <button class="btn small secondary" data-admin-delete-story>${t('Delete Story', 'حذف القصة')}</button>
      </div>
    </article>`;
}


function userAdminCard(item) {
  const d = item.data || {};
  const profile = d.profile || {};
  const displayName = profile.name || t('Traveler', 'مسافر');
  const email = profile.email || '';
  return `
    <article class="card admin-user-card">
      <div class="card-title">${escapeHtml(displayName)}</div>
      <div class="card-copy">${escapeHtml(email)}</div>
      <div class="card-copy"><small>${t('User ID', 'معرّف المستخدم')}: ${escapeHtml(item.id)}</small></div>
    </article>`;
}

async function loadAdminData() {
  if (!adminAccess || !db) return;
  const ticketTarget = document.getElementById('admin-tickets');
  const storyTarget = document.getElementById('admin-stories');
  const userTarget = document.getElementById('admin-users');

  try {
    const [ticketsSnapshot, storiesSnapshot, usersSnapshot] = await Promise.all([
      getDocs(collection(db, 'supportTickets')),
      getDocs(collection(db, 'stories')),
      getDocs(collection(db, 'users'))
    ]);

    const tickets = ticketsSnapshot.docs
      .map(item => ({ id: item.id, data: item.data() }))
      .sort((a, b) => String(b.data.createdAtText || '').localeCompare(String(a.data.createdAtText || '')));
    const stories = storiesSnapshot.docs.map(item => ({ id: item.id, data: item.data() }));
    const users = usersSnapshot.docs.map(item => ({ id: item.id, data: item.data() }));

    const counts = {
      users: users.length,
      open: tickets.filter(item => (item.data.status || 'Open') === 'Open').length,
      progress: tickets.filter(item => item.data.status === 'In Progress').length,
      resolved: tickets.filter(item => item.data.status === 'Resolved' || item.data.status === 'Closed').length,
      stories: stories.length
    };

    const statValues = document.querySelectorAll('#admin-stats strong');
    [counts.users, counts.open, counts.progress, counts.resolved, counts.stories].forEach((value, index) => {
      if (statValues[index]) statValues[index].textContent = value;
    });

    if (ticketTarget) {
      ticketTarget.className = tickets.length ? 'cards' : 'callout';
      ticketTarget.innerHTML = tickets.length
        ? tickets.map(item => ticketCard(item, true)).join('')
        : `<p>${t('No support requests yet.', 'لا توجد طلبات دعم حتى الآن.')}</p>`;
    }

    if (userTarget) {
      userTarget.className = users.length ? 'cards admin-users-grid' : 'callout';
      userTarget.innerHTML = users.length
        ? users.map(userAdminCard).join('')
        : `<p>${t('No registered users yet.', 'لا يوجد مستخدمون مسجلون حتى الآن.')}</p>`;
    }

    if (storyTarget) {
      storyTarget.className = stories.length ? 'cards' : 'callout';
      storyTarget.innerHTML = stories.length
        ? stories.map(storyAdminCard).join('')
        : `<p>${t('No community stories yet.', 'لا توجد قصص مجتمع حتى الآن.')}</p>`;
    }

    bindAdminActions();
  } catch (error) {
    console.error('Could not load admin data:', error);
    if (ticketTarget) ticketTarget.innerHTML = `<p>${t('Could not load support requests.', 'تعذر تحميل طلبات الدعم.')}</p>`;
    if (userTarget) userTarget.innerHTML = `<p>${t('Could not load users.', 'تعذر تحميل المستخدمين.')}</p>`;
    if (storyTarget) storyTarget.innerHTML = `<p>${t('Could not load stories.', 'تعذر تحميل القصص.')}</p>`;
  }
}

function bindAdminActions() {
  document.querySelectorAll('[data-ticket-status]').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-ticket-id]');
      if (!card) return;
      button.disabled = true;
      try {
        await updateDoc(doc(db, 'supportTickets', card.dataset.ticketId), {
          status: button.dataset.ticketStatus,
          updatedAt: serverTimestamp()
        });
        showToast(t('Ticket status updated.', 'تم تحديث حالة الطلب.'));
        await loadAdminData();
      } catch (error) {
        console.error(error);
        showToast(t('Could not update the ticket.', 'تعذر تحديث الطلب.'));
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-ticket-action="reply"]').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-ticket-id]');
      const reply = card?.querySelector('.admin-reply')?.value.trim() || '';
      if (!card) return;
      button.disabled = true;
      try {
        await updateDoc(doc(db, 'supportTickets', card.dataset.ticketId), {
          adminReply: reply,
          status: reply ? 'In Progress' : 'Open',
          updatedAt: serverTimestamp()
        });
        showToast(t('Reply saved.', 'تم حفظ الرد.'));
        await loadAdminData();
      } catch (error) {
        console.error(error);
        showToast(t('Could not save the reply.', 'تعذر حفظ الرد.'));
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-admin-delete-story]').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-story-id]');
      if (!card) return;
      if (!confirm(t('Delete this community story?', 'حذف هذه القصة من المجتمع؟'))) return;
      button.disabled = true;
      try {
        await deleteDoc(doc(db, 'stories', card.dataset.storyId));
        showToast(t('Story deleted.', 'تم حذف القصة.'));
        await loadAdminData();
      } catch (error) {
        console.error(error);
        showToast(t('Could not delete the story.', 'تعذر حذف القصة.'));
        button.disabled = false;
      }
    });
  });
}

async function renderAdmin(force = false) {
  const existing = document.querySelector('[data-addon-page="admin"]');
  if (existing && !force) {
    setActiveNav('admin');
    return;
  }
  if (!replacePage(adminPageHtml(), 'admin', force)) return;
  setActiveNav('admin');
  if (adminAccess) await loadAdminData();
}

async function renderAddonRoute(force = false) {
  if (rendering) return;
  const current = route();
  if (!ADDON_ROUTES.has(current)) {
    ensureNavigation();
    ensureHomeSupportCard();
    ensureProfileShortcuts();
    ensureSupportFab();
    return;
  }

  rendering = true;
  try {
    ensureNavigation();
    ensureSupportFab();
    if (current === 'support') await renderSupport(force);
    if (current === 'admin') await renderAdmin(force);
  } finally {
    rendering = false;
  }
}

async function checkAdmin(user) {
  if (!user || !db) return false;
  try {
    const snapshot = await getDoc(doc(db, 'admins', user.uid));
    return snapshot.exists();
  } catch (error) {
    console.warn('Admin check failed:', error);
    return false;
  }
}

async function start() {
  if (!window.TOURISM_FIREBASE_CONFIG) {
    console.error('Support module could not find the Firebase configuration.');
    return;
  }

  let firebaseApp = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (getApps().length) {
      firebaseApp = getApp();
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!firebaseApp) firebaseApp = initializeApp(window.TOURISM_FIREBASE_CONFIG);

  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    adminAccess = await checkAdmin(user);
    ensureNavigation();
    ensureProfileShortcuts();
    ensureSupportFab();
    await renderAddonRoute(true);
  });

  addEventListener('hashchange', () => setTimeout(renderAddonRoute, 0));

  const observer = new MutationObserver(() => {
    ensureNavigation();
    ensureHomeSupportCard();
    ensureProfileShortcuts();
    ensureSupportFab();
    const current = route();
    if (ADDON_ROUTES.has(current) && !document.querySelector(`[data-addon-page="${current}"]`)) {
      setTimeout(renderAddonRoute, 0);
    }
  });
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });

  await renderAddonRoute();
}

start().catch(error => console.error('Support module failed to start:', error));
