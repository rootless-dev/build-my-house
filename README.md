# Build my House

Ferramenta web de modelagem 3D de construções, no espírito do SketchUp da época
do Google: você desenha no chão, empurra a face para cima e a casa aparece.
React + TypeScript + three.js, sem dependência de servidor.

```bash
npm install
npm run dev
```

## Como funciona o modelo

O ponto central é que **faces não são armazenadas**. O modelo guarda só vértices
e arestas; as faces são recalculadas a cada mudança pelo arranjo planar
(`src/core/faces.ts`): para cada plano do modelo, as arestas coplanares são
projetadas em 2D e percorridas por meio-arcos até fechar os ciclos mínimos.

Isso é o que dá o comportamento que se espera de um modelador direto:

| O que você faz | O que acontece sozinho |
| --- | --- |
| Fecha um laço de linhas | A face aparece |
| Desenha um retângulo sobre uma face | A face se divide em duas |
| Desenha um retângulo dentro de outro | Vira furo na face de fora |
| Apaga uma aresta | As faces vizinhas se fundem |
| Cruza duas linhas | Ambas são quebradas no cruzamento |
| Empurra uma face até o outro lado | O vão fica vazado |

As normais são orientadas por casca fechada (volume com sinal), então o lado
"frente" (branco) fica por fora e o "verso" (azul) por dentro, como no SketchUp.

## Ferramentas

| Ferramenta | Atalho | O que faz |
| --- | --- | --- |
| Selecionar | `Espaço` | Clique seleciona; Shift alterna; duplo clique pega a face com as arestas |
| Linha | `L` | Cadeia de segmentos; fecha o laço para criar a face |
| Retângulo | `R` | Dois cantos; aceita `4;3` na caixa de medidas |
| Círculo | `C` | Centro e raio, 32 lados |
| Polígono | `G` | Número de lados no painel Ajustes |
| Arco | `A` | Corda em dois cliques, o terceiro puxa a flecha |
| Empurrar/Puxar | `P` | Dá volume à face; duplo clique repete a última distância |
| Deslocar | `F` | Offset do contorno da face — é assim que se faz espessura de parede |
| Mover | `M` | Move a seleção a partir de um ponto de referência |
| Girar | `Q` | Centro, referência, ângulo |
| Escala | `S` | Redimensiona a seleção; aceita `2`, `0,5` ou `150%` |
| Borracha | `E` | Arraste sobre arestas, guias e etiquetas; `Ctrl` suaviza em vez de apagar |
| Pintar | `B` | Aplica o material ativo; `Alt` copia o material da face |
| Trena e guias | `T` | Mede e deixa guias (veja abaixo) |
| Cota | `D` | Marca a medida no modelo, com linhas de chamada |
| Texto | `X` | Anotação com linha de chamada, presa a um ponto |
| Orbitar / Deslocar vista | `O` / `H` | Navegação dedicada |

## Anotações

O que fica marcado no desenho vive fora do grafo de arestas: não vira face,
não sai na exportação de malha, e some junto se você apagar.

**Cota (`D`)** — clique em dois pontos e afaste a linha de cota; ou clique
direto sobre uma aresta para cotá-la inteira de uma vez. O afastamento sempre
assenta num eixo, e as setas travam qual deles. A etiqueta mostra a medida real:
mova a geometria e ela se atualiza sozinha, porque a cota fica presa aos
vértices, não a coordenadas soltas.

**Texto (`X`)** — clique no que quer anotar e afaste a chamada. O texto já vem
preenchido com o que faz sentido para o alvo: área da face, comprimento da
aresta ou as coordenadas do ponto. Duplo clique na etiqueta reescreve.

**Trena e guias (`T`)** — como a fita métrica do SketchUp, mede *e* deixa
construção:

- a partir de uma **aresta**, arrastar cria uma linha-guia paralela;
- a partir de um **ponto**, o segundo clique deixa um ponto-guia;
- com `Ctrl`, só mede e não cria nada;
- digitar um valor coloca a guia na distância exata.

As guias entram na inferência (o cursor gruda nelas), aparecem tracejadas e
somem no botão “Apagar todas as guias”, no painel Ajustes.

Clicar numa etiqueta seleciona a anotação; com a borracha ativa, apaga.

## Navegação e precisão

- **Botão do meio** orbita, **Shift + meio** (ou botão direito) desloca a vista,
  **roda** dá zoom no ponto sob o cursor.
- A **inferência** gruda o cursor em extremidade, ponto médio, aresta, face e nos
  alinhamentos com os eixos vermelho/verde/azul. O marcador e a etiqueta ao lado
  do cursor dizem o que foi capturado.
- As **setas** travam no eixo X, Y ou Z. Aperte de novo para destravar.
- **Digite um número em qualquer lugar** e ele vai para a caixa de medidas, no
  canto inferior direito. Enter aplica o valor exato à operação em andamento:
  comprimento da linha, `largura;profundidade` do retângulo, raio, distância do
  push/pull, ângulo da rotação.
- `Ctrl Z` / `Ctrl Shift Z` desfaz e refaz. `Del` apaga a seleção. `Esc` cancela.

Unidades em metros, centímetros ou milímetros (painel Ajustes). A caixa de
medidas aceita sufixo próprio: `350cm` funciona mesmo com o projeto em metros.

## Roteiro de uma casa

1. Retângulo no chão: `R`, clique, digite `8;6`, Enter.
2. Levantar as paredes: `P`, clique na laje, digite `2.8`, Enter.
3. Espessura: `F` na face de cima, digite `0.2`, Enter.
4. Vazar o miolo: `P` na face interna, digite `-2.6`, Enter.
5. Janela: `R` na parede, `P` na abertura com `-0.2` — o vão atravessa.
6. Cotar: `D`, clique nos dois cantos da fachada, seta para travar o lado, clique.

## Publicar

O app é 100% estático — sem servidor, sem banco, tudo roda no navegador. Dá para
hospedar em GitHub Pages, Netlify, Vercel ou qualquer pasta servida por HTTP.

O build sai com caminhos **relativos** (`base: './'` no `vite.config.ts`), então
funciona tanto na raiz de um domínio quanto dentro de uma subpasta — que é o
caso do Pages de projeto, em `usuario.github.io/build-my-house/`.

Já existe o workflow em `.github/workflows/deploy.yml`. Para ligar:

1. `git init && git add . && git commit -m "primeiro commit"`
2. Crie o repositório no GitHub e faça o push na branch `main`.
3. Em **Settings → Pages**, escolha **Source: GitHub Actions**.

A cada push na `main` o workflow roda lint, build e publica. Repositório privado
precisa de plano pago para usar o Pages; público funciona no plano gratuito.

Para conferir localmente como vai ficar numa subpasta:

```bash
npm run build
mkdir -p /tmp/pages/build-my-house && cp -R dist/. /tmp/pages/build-my-house/
cd /tmp/pages && python3 -m http.server 8099
# abra http://localhost:8099/build-my-house/
```

## Arquivos

- `.casa` — projeto completo (JSON), abre de volta com toda a geometria,
  materiais e faces apagadas.
- `.obj` — malha triangulada com grupos por material, convertida para Y-up.
- `.stl` — malha para impressão 3D.

## Organização do código

```
src/
  core/       geometria pura, sem three.js nem React
    math.ts       vetores, planos, interseções
    faces.ts      arranjo planar: arestas → faces com furos
    model.ts      grafo, desenho, push/pull, offset, serialização
    tessellate.ts triangulação de face com furos
    units.ts      formatação e leitura de medidas
    io.ts         .casa / .obj / .stl
    selftest.ts   verificação do núcleo (veja abaixo)
  viewer/     three.js
    Viewport.ts     cena, luzes, entrada, etiquetas DOM, despacho de ferramentas
    CameraRig.ts    órbita Z-up estilo SketchUp
    ModelView.ts    modelo → malhas e arestas
    Inference.ts    motor de inferência/snap
    Overlay.ts      elásticos, guias e pré-visualizações
    annotations.ts  geometria de cotas, textos e guias
  tools/      uma classe por ferramenta
  state/      store zustand (o modelo é um singleton mutável fora do React)
  ui/         componentes React
  styles/     SCSS
```

### Verificação do núcleo geométrico

Com o dev server rodando, no console do navegador:

```js
const { selftest } = await import('/src/core/selftest.ts');
console.table(selftest());
```

Cobre criação de face, caixa por push/pull, esticar em vez de duplicar, furo,
quebra em cruzamento, fusão ao apagar aresta, vão vazado, cota presa ao vértice
e ida-e-volta de arquivo (inclusive projetos da versão 1, sem anotações).

## Limites conhecidos

- Sem grupos e componentes: o modelo é uma malha única. Geometrias que se tocam
  se fundem, como no SketchUp sem agrupar.
- Sem operações booleanas de verdade. O "vazar" do push/pull é uma heurística:
  funciona quando a face de destino contém a extrusão.
- Sem texturas de imagem — materiais são cor, rugosidade e transparência.
- As faces são recalculadas por inteiro a cada edição. Confortável até alguns
  milhares de arestas.

### Da barra do SketchUp, ainda faltam

- **Seguir-me** (extrudar um perfil ao longo de um caminho) — é o que faz
  rodapé, cimalha e telhado curvo.
- **Plano de seção** — corte para ver o interior sem esconder paredes.
- **Transferidor** — guias em ângulo.
- **Posicionar câmera / Passear / Olhar ao redor** — vista em altura de olho.
- **Texto 3D** e **mão livre**.
- **Camadas/tags e cenas** — organizar e guardar pontos de vista.
