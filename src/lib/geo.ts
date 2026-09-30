import { distanciaMetros } from './ponto';
import type { ConfigPonto } from './types';

export type EstadoLocal =
  | { estado: 'verificando' }
  | { estado: 'dentro' | 'fora'; distancia: number; precisao: number }
  | { estado: 'negado' | 'indisponivel' | 'erro'; mensagem: string };

export interface Posicao { lat: number; lng: number; precisao: number }

/** Lê a posição do aparelho. Sempre pede uma leitura recente (não usa posição antiga). */
export function lerPosicao(): Promise<Posicao> {
  return new Promise((res, rej) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return rej({ estado: 'indisponivel', mensagem: 'Este aparelho ou navegador não oferece localização (GPS).' });
    // Se o usuário ignora o pedido de permissão, o navegador nunca responde: não deixa a tela "verificando" para sempre.
    const espera = setTimeout(() => rej({ estado: 'erro', mensagem: 'Sem resposta da localização. Se o navegador pediu permissão, toque em "Permitir" e depois em "Verificar de novo".' }), 20000);
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(espera); res({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }); },
      e => { clearTimeout(espera); rej(e.code === 1
        ? { estado: 'negado', mensagem: 'A permissão de localização foi negada. Libere a localização deste site nas configurações do navegador e tente de novo.' }
        : e.code === 3
          ? { estado: 'erro', mensagem: 'Não foi possível obter a localização a tempo. Vá para um local com melhor sinal e tente de novo.' }
          : { estado: 'erro', mensagem: 'Não foi possível obter a localização. Ative o GPS do aparelho e tente de novo.' }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export async function verificarLocal(cfg: ConfigPonto): Promise<EstadoLocal> {
  try {
    const p = await lerPosicao();
    const distancia = distanciaMetros(p.lat, p.lng, cfg.geofence_lat, cfg.geofence_lng);
    return { estado: distancia <= cfg.geofence_raio_m ? 'dentro' : 'fora', distancia, precisao: p.precisao };
  } catch (e) {
    return e as EstadoLocal;
  }
}

export const fmtDistancia = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
export const linkMapa = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
