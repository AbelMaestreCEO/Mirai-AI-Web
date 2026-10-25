// Instalacion desde el boton «Instalar en Linux» de Mirai Store.
//
// El navegador solo abre el dialogo de instalacion en el origen de la propia
// app, asi que Store abre esta pagina con `?instalar=linux` y aqui se
// intercepta `beforeinstallprompt` para ofrecer el boton.

import { ref } from 'vue';

interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const ofrecerInstalar = ref(false);
export const puedeInstalar = ref(false);

let eventoInstalacion: EventoInstalacion | null = null;

function quitarParametroInstalar(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('instalar')) return;
  url.searchParams.delete('instalar');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

export function prepararInstalacionLinux(): void {
  if (new URLSearchParams(location.search).get('instalar') !== 'linux') return;

  if (window.matchMedia('(display-mode: standalone)').matches) {
    quitarParametroInstalar();
    return;
  }

  ofrecerInstalar.value = true;

  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    eventoInstalacion = evento as EventoInstalacion;
    puedeInstalar.value = true;
  });

  window.addEventListener('appinstalled', () => {
    ofrecerInstalar.value = false;
    quitarParametroInstalar();
  });
}

export async function instalarAplicacion(): Promise<void> {
  if (!eventoInstalacion) return;

  await eventoInstalacion.prompt();
  await eventoInstalacion.userChoice.catch(() => undefined);

  eventoInstalacion = null;
  puedeInstalar.value = false;
  ofrecerInstalar.value = false;
  quitarParametroInstalar();
}

export function cerrarInstalacion(): void {
  ofrecerInstalar.value = false;
  quitarParametroInstalar();
}
