/**
 * Web Push 서버 서명 키를 한 번만 생성. 개인 키는 저장소 밖에 보관
 * 재실행해도 기존 키를 덮어쓰지 않아 설치 기기의 구독을 유지
 */
import { createECDH } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, parse } from 'node:path';

const args = process.argv.slice(2);
const readOption = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

try {
  const subject = readOption('--subject');
  const contact = subject && new URL(subject);
  if (!contact || !['mailto:', 'https:'].includes(contact.protocol)
    || contact.username || contact.password || contact.hash
    || /[\r\n\s]/.test(subject)
    || (contact.protocol === 'mailto:' && !contact.pathname.includes('@'))
    || (contact.protocol === 'https:' && (!contact.hostname.includes('.') || contact.hostname === 'localhost'))) {
    throw new Error('--subject에 운영자 이메일(mailto:주소) 또는 프로젝트 HTTPS 주소를 입력해 주세요.');
  }

  const destination = resolve(readOption('--output') || join(homedir(), '.jette-yak', 'push.properties'));
  for (let directory = dirname(destination); ; directory = dirname(directory)) {
    if (existsSync(join(directory, '.git'))) throw new Error('개인 키는 Git 저장소 밖에 보관해 주세요.');
    if (directory === parse(directory).root) break;
  }
  if (existsSync(destination)) {
    process.stdout.write(`기존 키 유지: ${destination}\n`);
  } else {
    const key = createECDH('prime256v1');
    key.generateKeys();
    const publicKey = key.getPublicKey(undefined, 'uncompressed').toString('base64url');
    const privateKey = key.getPrivateKey().toString('base64url');
    const properties = [
      '# Web Push VAPID keys. Keep this file outside Git. Never share the private key.',
      `push.vapid.public-key=${publicKey}`,
      `push.vapid.private-key=${privateKey}`,
      `push.vapid.subject=${subject}`,
      '',
    ].join('\n');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    // wx: 다른 프로세스가 먼저 만든 파일도 덮어쓰지 않음
    writeFileSync(destination, properties, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`키 생성 완료: ${destination}\n개인 키를 Git에 올리거나 공유하지 마세요.\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
