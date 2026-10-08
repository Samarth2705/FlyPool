import api from './client';

export async function getHealth() {
  const res = await api.get('/health');
  return res.data.data;
}
