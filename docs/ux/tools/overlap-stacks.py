"""Pilas de solapes de un .rdlc/.rdl (evidencia de docs/ux/0003, parte 2: capas).

Uso:  python docs/ux/tools/overlap-stacks.py <informe.rdlc>

Por cada contenedor (cuerpo, Rectangle, celdas de Tablix) agrupa a los hermanos que se
solapan (componentes conexas por intersección de rectángulos) y lista las pilas de 2 o
más miembros con su ZIndex. Es el mismo criterio que propone docs/features/0001-capas.md.

LIMITACIONES (importantes al interpretar los resultados):
  * Usa Left/Top/Width/Height DECLARADOS. El tamaño real de un Tablix crece con sus
    filas; el diseño de capas usa `tablixLayout`, así que este script puede INFRAESTIMAR
    los solapes de Tablix.
  * Longitudes en mm/cm/in/pt/pc; cualquier otra unidad cuenta como 0.
  * Solo lectura: no modifica el fichero.
"""
import sys, re
import xml.etree.ElementTree as ET
path = sys.argv[1]
tree = ET.parse(path)
def ln(t): return t.split('}')[-1]
def mm(v):
    if v is None: return 0.0
    m = re.match(r'^(-?[\d.]+)(mm|cm|in|pt|pc)$', v.strip())
    if not m: return 0.0
    n=float(m.group(1)); u=m.group(2)
    return n*{'mm':1,'cm':10,'in':25.4,'pt':25.4/72,'pc':25.4/6}[u]
def child(e,name):
    for c in e:
        if ln(c.tag)==name: return c
def txt(e,name):
    c=child(e,name); return c.text if c is not None else None
ITEMS={'Textbox','Tablix','Rectangle','Image','Line','Subreport','Chart','GaugePanel','Map'}
def items_of(container):
    out=[]
    for c in container:
        if ln(c.tag) in ITEMS: out.append(c)
    return out
def rect(it):
    return (mm(txt(it,'Left')),mm(txt(it,'Top')),mm(txt(it,'Width')),mm(txt(it,'Height')))
def inter(a,b):
    return a[0]<b[0]+b[2] and b[0]<a[0]+a[2] and a[1]<b[1]+b[3] and b[1]<a[1]+a[3]
def stacks(label, its):
    n=len(its)
    if n<2: return
    rs=[rect(i) for i in its]
    parent=list(range(n))
    def f(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    pairs=0
    for i in range(n):
        for j in range(i+1,n):
            if inter(rs[i],rs[j]): parent[f(i)]=f(j); pairs+=1
    groups={}
    for i in range(n): groups.setdefault(f(i),[]).append(i)
    big=[g for g in groups.values() if len(g)>=2]
    if big:
        print(f"[{label}] {n} hermanos, {pairs} pares solapados")
        for g in big:
            names=[f"{ln(its[i].tag)}:{its[i].get('Name')} z={txt(its[i],'ZIndex') or 0}" for i in g]
            # max simultaneous depth at any point? approximate by pairwise adjacency count
            adj=sum(1 for a in g for b in g if a<b and inter(rs[a],rs[b]))
            full=len(g)*(len(g)-1)//2
            print(f"   pila de {len(g)} (pares solapados {adj}/{full}):", ", ".join(names))
def walk(e, label):
    # containers: Body ReportItems, Rectangle ReportItems, Tablix cell contents
    for c in e:
        t=ln(c.tag)
        if t=='ReportItems':
            its=items_of(c)
            stacks(label+'/ReportItems', its)
            for it in its: walk_item(it,label)
        else:
            walk(c,label)
def walk_item(it,label):
    name=f"{ln(it.tag)}:{it.get('Name')}"
    walk(it,label+'>'+name)
root=tree.getroot()
walk(root,'')
