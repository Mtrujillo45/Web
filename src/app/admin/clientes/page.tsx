import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { TarjetaEmpresa } from "@/components/admin/tarjeta-empresa";

export default async function ClientesPage() {
  await requireRolPagina(["COMERCIAL"]);

  const empresasDb = await prisma.empresa.findMany({
    include: { condicion: true },
    orderBy: { creadoEn: "desc" },
  });

  const empresas = empresasDb.map((e) => ({
    id: e.id,
    nombreComercial: e.nombreComercial,
    razonSocial: e.razonSocial,
    nitOCedula: e.nitOCedula,
    pais: e.pais,
    ciudad: e.ciudad,
    telefono: e.telefono,
    emailContacto: e.emailContacto,
    estado: e.estado,
    condicion: e.condicion
      ? {
          porcentajeDescuento: Number(e.condicion.porcentajeDescuento),
          moneda: e.condicion.moneda,
          moqTotalPedido: e.condicion.moqTotalPedido,
          terminosPago: e.condicion.terminosPago,
        }
      : null,
  }));

  const pendientes = empresas.filter((e) => e.estado === "PENDIENTE");
  const aprobados = empresas.filter((e) => e.estado === "APROBADO");
  const otros = empresas.filter((e) => e.estado === "RECHAZADO" || e.estado === "SUSPENDIDO");

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
          Pendientes de aprobación <Badge tono="advertencia">{pendientes.length}</Badge>
        </h2>
        <div className="flex flex-col gap-4">
          {pendientes.length === 0 && (
            <Card>
              <p className="text-sm text-brand-700">No hay registros pendientes.</p>
            </Card>
          )}
          {pendientes.map((empresa) => (
            <TarjetaEmpresa key={empresa.id} empresa={empresa} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-700">
          Clientes aprobados
        </h2>
        <div className="flex flex-col gap-4">
          {aprobados.length === 0 && (
            <Card>
              <p className="text-sm text-brand-700">Todavía no hay clientes aprobados.</p>
            </Card>
          )}
          {aprobados.map((empresa) => (
            <TarjetaEmpresa key={empresa.id} empresa={empresa} />
          ))}
        </div>
      </section>

      {otros.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Rechazados / suspendidos
          </h2>
          <div className="flex flex-col gap-4">
            {otros.map((empresa) => (
              <TarjetaEmpresa key={empresa.id} empresa={empresa} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
