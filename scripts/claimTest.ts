import { getBoss } from '../packages/api/src/lib/jobs/index';
(async () => {
  const boss = await getBoss();
  const id = await boss.send('creative-production', { runIds: [] });
  console.log('SENT=' + id);
  process.exit(0);
})().catch((error) => {
  console.log('SEND_FAIL=' + String((error as Error)?.message ?? error).slice(0, 200));
  process.exit(0);
});
