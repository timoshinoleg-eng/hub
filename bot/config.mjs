import { notificationsEnabled } from '../server/notifications.mjs';

const env = (name) => String(process.env[name] || '').trim();

export const ORG = {
  name: env('HUB_ORG_NAME'),
  inn: env('HUB_ORG_INN'),
  policyUrl: env('HUB_POLICY_URL'),
  offerUrl: env('HUB_OFFER_URL'),
  siteUrl: env('HUB_SITE_URL'),
  support: env('HUB_SUPPORT_EMAIL'),
  ageRating: env('HUB_AGE_RATING') || '12+',
};

/**
 * Другие активные боты этой же организации. Нулевые потери:
 * кросс-промо между своими проектами — самый дешёвый канал,
 * потому что каталога мини-приложений в MAX нет.
 *
 * [{ title: 'Название', url: 'https://max.ru/id0000000000_bot' }]
 */
export const SISTER_PROJECTS = [
  // { title: 'Другой наш проект', url: 'https://max.ru/id0000000000_bot' },
];

/** URL мини-приложения хаба — для шаринга и кнопок. */
export const WEBAPP_URL = process.env.HUB_WEBAPP_URL || '';

/**
 * Ник бота, который платформа сгенерировала автоматически
 * (id<ИНН>_bot для юрлица, se<orgid>_bot для самозанятого).
 * Нужен для глубоких ссылок вида https://max.ru/<ник>?startapp=g<игра>.
 * Изменить ник нельзя — его можно только посмотреть в карточке бота.
 */
export const BOT_USERNAME = process.env.HUB_BOT_USERNAME || '';

/** Секретный маркер для админских команд. */
export const ADMIN_IDS = (process.env.HUB_ADMIN_IDS || '')
  .split(',').map((s) => Number(s.trim())).filter(Number.isFinite);

export const NOTIFICATIONS_ENABLED = notificationsEnabled();
