import nodemailer from 'nodemailer';
import type {NotificationConfig} from './settings.js';
export function criarTransporteEmail(cfg: NotificationConfig) {
  const s = cfg.email;
  return nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.secure,
    requireTLS: !s.secure,
    auth: s.user ? {user:s.user, pass:s.password} : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
}


