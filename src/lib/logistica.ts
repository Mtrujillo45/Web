export type InfoLogistica = {
  transportadora: string | null;
  numeroGuia: string | null;
  guiaUrl: string | null;
  linkSeguimiento: string | null;
};

export function tieneInfoLogistica(p: InfoLogistica): boolean {
  return Boolean(p.transportadora || p.numeroGuia || p.guiaUrl || p.linkSeguimiento);
}
