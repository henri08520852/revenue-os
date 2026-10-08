// Revenue OS – Gmail Add-on
// Sidebar in Gmail: shows the CRM context of the open email and logs it into Revenue OS.
// Setup: see gmail-addon/README.md. Talks only to API_URL (app/api/addon/route.ts).

var API_URL = 'https://revenue-os-chi.vercel.app/api/addon';
var APP_URL = 'https://revenue-os-chi.vercel.app';

// ---------- entry points ----------

function onHomepage() {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Revenue OS'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('Öffne eine E-Mail, um zu sehen, wer der Absender im CRM ist, und sie mit einem Klick zu loggen.'))
      .addWidget(linkButton_('Revenue OS öffnen', APP_URL)))
    .build();
}

function onGmailMessage(e) {
  return buildMessageCard_(e);
}

// ---------- Gmail helpers ----------

function currentMessage_(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return GmailApp.getMessageById(e.gmail.messageId);
}

function addresses_(header) {
  return (String(header || '').match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(function (a) { return a.toLowerCase(); });
}

function displayName_(header) {
  var m = String(header || '').match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : null;
}

function serialize_(m) {
  var attachments = false;
  try { attachments = m.getAttachments().length > 0; } catch (err) { /* ignore */ }
  return {
    gmailId: m.getId(),
    threadId: m.getThread().getId(),
    messageId: m.getHeader('Message-ID') || null,
    subject: m.getSubject(),
    fromEmail: addresses_(m.getFrom())[0] || null,
    fromName: displayName_(m.getFrom()),
    to: addresses_(m.getTo()),
    cc: addresses_(m.getCc()),
    date: m.getDate().toISOString(),
    body: String(m.getPlainBody() || '').slice(0, 50000),
    hasAttachments: attachments
  };
}

// The open email, or its whole conversation
function messagesFor_(e, wholeThread) {
  var m = currentMessage_(e);
  if (!wholeThread) return [serialize_(m)];
  try {
    return m.getThread().getMessages().slice(-30).map(serialize_);
  } catch (err) {
    return [serialize_(m)];
  }
}

// ---------- API ----------

function api_(action, payload) {
  var body = payload || {};
  body.action = action;
  var res = UrlFetchApp.fetch(API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getIdentityToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (err) { /* not JSON */ }
  if (res.getResponseCode() >= 300) throw new Error(json.error || ('Revenue OS antwortet mit ' + res.getResponseCode()));
  return json;
}

// ---------- UI helpers ----------

function linkButton_(text, url) {
  return CardService.newTextButton().setText(text).setOpenLink(CardService.newOpenLink().setUrl(url));
}

function actionButton_(text, fn, params, filled) {
  var b = CardService.newTextButton().setText(text)
    .setOnClickAction(CardService.newAction().setFunctionName(fn).setParameters(params || {}));
  if (filled) b.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  return b;
}

function input_(name, title, value) {
  var w = CardService.newTextInput().setFieldName(name).setTitle(title);
  if (value) w.setValue(value);
  return w;
}

function formValue_(e, name) {
  var f = e.commonEventObject && e.commonEventObject.formInputs && e.commonEventObject.formInputs[name];
  if (!f) return '';
  if (f.stringInputs) return f.stringInputs.value[0] || '';
  if (f.dateInput) return Utilities.formatDate(new Date(Number(f.dateInput.msSinceEpoch)), 'UTC', 'yyyy-MM-dd');
  return '';
}

function dateLabel_(iso) {
  return iso ? Utilities.formatDate(new Date(iso), 'Europe/Berlin', 'dd.MM.yy') : '';
}

function errorCard_(message) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Revenue OS'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('⚠️ ' + message))
      .addWidget(linkButton_('Revenue OS öffnen', APP_URL)))
    .build();
}

function respond_(e, notification) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(notification))
    .setNavigation(CardService.newNavigation().updateCard(buildMessageCard_(e)))
    .build();
}

function fail_(err) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('⚠️ ' + (err && err.message ? err.message : err)))
    .build();
}

// ---------- main card ----------

function buildMessageCard_(e) {
  var msg, ctx;
  try {
    msg = serialize_(currentMessage_(e));
    ctx = api_('context', { fromEmail: msg.fromEmail, fromName: msg.fromName, to: msg.to, cc: msg.cc, messageIds: [msg.messageId || ('gmail:' + msg.gmailId)] });
  } catch (err) {
    return errorCard_(err.message);
  }

  var card = CardService.newCardBuilder();
  var title = ctx.person ? ctx.person.name : ctx.company ? ctx.company.name : 'Nicht im CRM';
  var subtitle = ctx.person
    ? [ctx.person.jobTitle, ctx.company && ctx.company.name].filter(Boolean).join(' · ')
    : ctx.company ? 'Company bekannt – Absender noch kein Kontakt'
    : (ctx.suggestion ? ctx.suggestion.email : 'Nur interne Teilnehmer');
  card.setHeader(CardService.newCardHeader().setTitle(title).setSubtitle(subtitle || ''));

  // Status + logging
  var status = CardService.newCardSection();
  status.addWidget(CardService.newDecoratedText()
    .setText(ctx.logged ? '✅ Diese E-Mail ist im CRM' : '○ Noch nicht im CRM'));

  if (ctx.company) {
    var openDeals = (ctx.deals || []).filter(function (d) { return d.open; });
    var dealSelect = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('dealId').setTitle('Deal')
      .addItem('— kein Deal —', '', openDeals.length === 0);
    openDeals.forEach(function (d, i) { dealSelect.addItem(d.name || 'Deal', d.id, i === 0); });
    status.addWidget(dealSelect);
    if (!ctx.person && (ctx.people || []).length) {
      var personSelect = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('personId').setTitle('Kontakt')
        .addItem('— keiner —', '', true);
      ctx.people.forEach(function (p) { personSelect.addItem(p.name, p.id, false); });
      status.addWidget(personSelect);
    }
    var params = { companyId: ctx.company.id, personId: ctx.person ? ctx.person.id : '' };
    status.addWidget(CardService.newButtonSet()
      .addButton(actionButton_(ctx.logged ? 'Erneut loggen' : 'E-Mail loggen', 'logMail', Object.assign({ thread: '0' }, params), !ctx.logged))
      .addButton(actionButton_('Ganzen Verlauf', 'logMail', Object.assign({ thread: '1' }, params), false)));
  }
  card.addSection(status);

  if (ctx.company) {
    var info = CardService.newCardSection().setHeader('Im CRM');
    (ctx.deals || []).slice(0, 5).forEach(function (d) {
      info.addWidget(CardService.newDecoratedText().setTopLabel('Deal · ' + d.stage).setText(d.name || 'Deal')
        .setBottomLabel(d.value ? Number(d.value).toLocaleString('de-DE') + ' €' : '')
        .setOpenLink(CardService.newOpenLink().setUrl(APP_URL + '/opportunities/' + d.id)));
    });
    (ctx.tasks || []).forEach(function (t) {
      info.addWidget(CardService.newDecoratedText().setTopLabel('Aufgabe' + (t.due ? ' · ' + dateLabel_(t.due) : '')).setText(t.title));
    });
    (ctx.activities || []).slice(0, 3).forEach(function (a) {
      info.addWidget(CardService.newDecoratedText().setTopLabel(a.type + ' · ' + dateLabel_(a.at)).setText(a.title || ''));
    });
    var links = CardService.newButtonSet();
    if (ctx.person) links.addButton(linkButton_('Kontakt öffnen', ctx.person.url));
    links.addButton(linkButton_('Company öffnen', ctx.company.url));
    info.addWidget(links);
    card.addSection(info);
  }

  // Unknown sender: create the contact (and company)
  if (!ctx.person && ctx.suggestion) {
    var s = ctx.suggestion;
    var create = CardService.newCardSection().setHeader('Kontakt anlegen & loggen').setCollapsible(!!ctx.company);
    create.addWidget(input_('firstName', 'Vorname', s.firstName));
    create.addWidget(input_('lastName', 'Nachname', s.lastName));
    if ((ctx.participants || []).length > 1) {
      var mail = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('email').setTitle('E-Mail');
      ctx.participants.forEach(function (a, i) { mail.addItem(a, a, i === 0); });
      create.addWidget(mail);
    } else {
      create.addWidget(input_('email', 'E-Mail', s.email));
    }
    create.addWidget(input_('jobTitle', 'Position (optional)', ''));
    var companySelect = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('companyId').setTitle('Company');
    if (ctx.company) companySelect.addItem(ctx.company.name, ctx.company.id, true);
    companySelect.addItem('+ Neue Company (unten)', '__new', !ctx.company);
    (ctx.companies || []).forEach(function (c) { if (!ctx.company || c.id !== ctx.company.id) companySelect.addItem(c.name, c.id, false); });
    create.addWidget(companySelect);
    if (!ctx.company) {
      create.addWidget(input_('newCompanyName', 'Neue Company – Name', s.companyName));
      create.addWidget(input_('newCompanyDomain', 'Neue Company – Domain', s.domain));
    }
    create.addWidget(CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('wholeThread')
      .addItem('Ganzen Verlauf loggen', '1', true));
    create.addWidget(actionButton_('Kontakt anlegen & loggen', 'createContact', {}, true));
    card.addSection(create);
  }

  // Follow-up task
  var task = CardService.newCardSection().setHeader('Aufgabe').setCollapsible(true);
  task.addWidget(input_('taskTitle', 'Titel', 'Follow-up: ' + (msg.subject || '').slice(0, 80)));
  task.addWidget(CardService.newDatePicker().setFieldName('taskDate').setTitle('Fällig am')
    .setValueInMsSinceEpoch(Date.now() + 3 * 86400000));
  task.addWidget(actionButton_('Aufgabe anlegen', 'createTask', {
    companyId: ctx.company ? ctx.company.id : '', personId: ctx.person ? ctx.person.id : ''
  }, false));
  card.addSection(task);

  return card.build();
}

// ---------- actions ----------

function logMail(e) {
  try {
    var p = e.commonEventObject.parameters || {};
    var res = api_('log', {
      messages: messagesFor_(e, p.thread === '1'),
      companyId: p.companyId,
      personId: p.personId || formValue_(e, 'personId') || null,
      opportunityId: formValue_(e, 'dealId') || null
    });
    return respond_(e, res.logged === 1 ? 'E-Mail geloggt' : res.logged + ' E-Mails geloggt');
  } catch (err) {
    return fail_(err);
  }
}

function createContact(e) {
  try {
    var companyId = formValue_(e, 'companyId');
    var res = api_('createContact', {
      firstName: formValue_(e, 'firstName'),
      lastName: formValue_(e, 'lastName'),
      email: formValue_(e, 'email'),
      jobTitle: formValue_(e, 'jobTitle'),
      companyId: companyId && companyId !== '__new' ? companyId : null,
      newCompanyName: formValue_(e, 'newCompanyName'),
      newCompanyDomain: formValue_(e, 'newCompanyDomain'),
      messages: messagesFor_(e, formValue_(e, 'wholeThread') === '1')
    });
    return respond_(e, 'Kontakt angelegt · ' + res.logged + ' E-Mail(s) im CRM');
  } catch (err) {
    return fail_(err);
  }
}

function createTask(e) {
  try {
    var p = e.commonEventObject.parameters || {};
    api_('task', {
      title: formValue_(e, 'taskTitle'),
      dueDate: formValue_(e, 'taskDate'),
      companyId: p.companyId || null,
      personId: p.personId || null,
      opportunityId: formValue_(e, 'dealId') || null
    });
    return respond_(e, 'Aufgabe angelegt');
  } catch (err) {
    return fail_(err);
  }
}
