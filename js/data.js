'use strict';
/* Dados de referência: grupos musculares, banco de exercícios e treinos iniciais. */

const MUSCLES = {
  gluteos:      { name: 'Glúteos',      region: 'inf',  plural: true },
  quadriceps:   { name: 'Quadríceps',   region: 'inf',  plural: true },
  posteriores:  { name: 'Posteriores',  region: 'inf',  plural: true, long: 'Posteriores de coxa' },
  adutores:     { name: 'Adutores',     region: 'inf',  plural: true },
  abdutores:    { name: 'Abdutores',    region: 'inf',  plural: true },
  panturrilhas: { name: 'Panturrilhas', region: 'inf',  plural: true },
  costas:       { name: 'Costas',       region: 'sup',  plural: true },
  peito:        { name: 'Peito',        region: 'sup',  plural: false },
  ombros:       { name: 'Ombros',       region: 'sup',  plural: true },
  biceps:       { name: 'Bíceps',       region: 'sup',  plural: true },
  triceps:      { name: 'Tríceps',      region: 'sup',  plural: true },
  abdomen:      { name: 'Abdômen',      region: 'core', plural: false },
  lombar:       { name: 'Lombar',       region: 'core', plural: false },
};
const MUSCLE_ORDER = Object.keys(MUSCLES);
const REGIONS = { inf: 'Inferiores', sup: 'Superiores', core: 'Core' };
const EQUIPMENT = ['Barra', 'Halteres', 'Máquina', 'Polia', 'Smith', 'Peso corporal', 'Elástico', 'Kettlebell', 'Anilha', 'Caneleira'];
const GOALS = { hipertrofia: 'Hipertrofia', fortalecimento: 'Fortalecimento', definicao: 'Definição', resistencia: 'Resistência muscular' };
const DIVISIONS = ['Inferiores', 'Superiores', 'Full body', 'Push', 'Pull', 'Core'];

// Animações de execução geradas por tools/gen_anim.py (img/ex/<id>.gif).
const ANIMATED = new Set([
  'afundo', 'agachamento-bulgaro', 'agachamento-goblet', 'agachamento-livre', 'agachamento-smith',
  'cadeira-extensora', 'cadeira-flexora', 'coice-maquina', 'coice-polia', 'elevacao-pelvica-maquina', 'glute-bridge',
  'good-morning', 'hack-squat', 'hip-thrust', 'hip-thrust-unilateral', 'leg-press-45', 'leg-press-horizontal',
  'mesa-flexora', 'panturrilha-em-pe', 'panturrilha-leg', 'panturrilha-sentada', 'panturrilha-unilateral', 'rdl',
  'step-up', 'stiff', 'terra'
]);
function exerciseAnim(id) {
  return ANIMATED.has(id) ? `img/ex/${id}.gif` : '';
}

// [id, nome, principal, secundários, equipamento, instruções]
const EXERCISE_LIBRARY = [
  // Glúteos
  ['hip-thrust', 'Hip Thrust', 'gluteos', 'posteriores adutores', 'Barra', 'Costas apoiadas no banco e barra sobre o quadril. Empurre o quadril até alinhar tronco e coxas e contraia os glúteos no topo.'],
  ['elevacao-pelvica-maquina', 'Elevação pélvica na máquina', 'gluteos', 'posteriores', 'Máquina', 'Mesmo padrão do hip thrust, com a carga guiada pela máquina. Pausa curta no topo.'],
  ['glute-bridge', 'Glute bridge', 'gluteos', 'posteriores', 'Barra', 'Deitada no chão, pés apoiados. Eleve o quadril contraindo os glúteos, sem hiperestender a lombar.'],
  ['hip-thrust-unilateral', 'Hip Thrust unilateral', 'gluteos', 'posteriores abdutores', 'Peso corporal', 'Uma perna apoiada, a outra elevada. Suba o quadril mantendo a pelve nivelada.'],
  ['coice-polia', 'Coice na polia', 'gluteos', 'posteriores', 'Polia', 'Tornozeleira na polia baixa. Estenda o quadril para trás sem arquear a lombar.'],
  ['coice-maquina', 'Coice na máquina (glúteo)', 'gluteos', 'posteriores', 'Máquina', 'Apoie o tronco e empurre a plataforma para trás estendendo o quadril.'],
  ['agachamento-sumo', 'Agachamento sumô', 'gluteos', 'adutores quadriceps', 'Halteres', 'Base afastada e pés para fora. Desça com o tronco firme e suba empurrando o chão.'],
  ['step-up', 'Step-up (subida no banco)', 'gluteos', 'quadriceps posteriores', 'Halteres', 'Pé inteiro no banco. Suba empurrando com a perna da frente, controlando a descida.'],
  ['hiperextensao-gluteo', 'Hiperextensão com foco em glúteo', 'gluteos', 'posteriores lombar', 'Peso corporal', 'No banco romano, coluna levemente arredondada e pés para fora. Suba contraindo os glúteos.'],
  ['kickback-smith', 'Coice no Smith', 'gluteos', 'posteriores', 'Smith', 'Em quatro apoios, pé na barra do Smith. Estenda o quadril até alinhar com o tronco.'],
  // Quadríceps
  ['agachamento-livre', 'Agachamento livre', 'quadriceps', 'gluteos adutores lombar', 'Barra', 'Barra sobre o trapézio. Desça controlando com joelhos na direção dos pés e suba mantendo o tronco firme.'],
  ['agachamento-smith', 'Agachamento no Smith', 'quadriceps', 'gluteos adutores', 'Smith', 'Pés levemente à frente da barra. Desça até a amplitude confortável e suba sem travar os joelhos.'],
  ['agachamento-goblet', 'Agachamento goblet', 'quadriceps', 'gluteos abdomen', 'Halteres', 'Halter junto ao peito. Desça entre as pernas mantendo o tronco ereto.'],
  ['leg-press-45', 'Leg press 45°', 'quadriceps', 'gluteos adutores', 'Máquina', 'Pés na largura do quadril. Desça até onde a lombar continua apoiada e empurre sem travar os joelhos.'],
  ['leg-press-horizontal', 'Leg press horizontal', 'quadriceps', 'gluteos', 'Máquina', 'Costas apoiadas. Empurre a plataforma controlando a volta.'],
  ['hack-squat', 'Hack squat', 'quadriceps', 'gluteos', 'Máquina', 'Costas apoiadas no encosto. Desça controlando e suba empurrando com o pé inteiro.'],
  ['cadeira-extensora', 'Cadeira extensora', 'quadriceps', '', 'Máquina', 'Ajuste o eixo no joelho. Estenda as pernas e segure um instante no topo.'],
  ['agachamento-bulgaro', 'Agachamento búlgaro', 'quadriceps', 'gluteos adutores', 'Halteres', 'Pé de trás no banco. Desça o joelho de trás em direção ao chão; tronco inclinado enfatiza glúteos.'],
  ['afundo', 'Afundo / passada', 'quadriceps', 'gluteos adutores', 'Halteres', 'Dê um passo e desça até os dois joelhos formarem cerca de 90°. Volte empurrando com a perna da frente.'],
  ['sissy-squat', 'Sissy squat', 'quadriceps', '', 'Peso corporal', 'Calcanhares elevados e joelhos à frente, inclinando o tronco para trás de forma controlada.'],
  // Posteriores
  ['stiff', 'Stiff', 'posteriores', 'gluteos lombar', 'Barra', 'Joelhos semiflexionados. Desça a barra rente às pernas levando o quadril para trás, coluna neutra.'],
  ['rdl', 'Levantamento terra romeno', 'posteriores', 'gluteos lombar', 'Halteres', 'Quadril para trás até sentir alongar os posteriores. Suba estendendo o quadril.'],
  ['terra', 'Levantamento terra', 'posteriores', 'gluteos lombar costas quadriceps', 'Barra', 'Barra próxima às canelas. Empurre o chão e estenda quadril e joelhos juntos, coluna neutra.'],
  ['mesa-flexora', 'Mesa flexora', 'posteriores', 'panturrilhas', 'Máquina', 'Deitada, quadril apoiado. Flexione os joelhos trazendo o rolo em direção aos glúteos.'],
  ['cadeira-flexora', 'Cadeira flexora', 'posteriores', '', 'Máquina', 'Sentada, coxas travadas. Flexione os joelhos controlando a volta.'],
  ['flexora-em-pe', 'Flexora em pé unilateral', 'posteriores', '', 'Máquina', 'Uma perna por vez, tronco estável. Flexione o joelho sem mover o quadril.'],
  ['good-morning', 'Good morning', 'posteriores', 'gluteos lombar', 'Barra', 'Barra nas costas. Incline o tronco levando o quadril para trás e retorne.'],
  ['nordic', 'Nordic curl', 'posteriores', '', 'Peso corporal', 'Ajoelhada com tornozelos presos. Desça o tronco o mais devagar possível.'],
  // Adutores
  ['cadeira-adutora', 'Cadeira adutora', 'adutores', '', 'Máquina', 'Feche as pernas contra as almofadas e controle a abertura.'],
  ['aducao-polia', 'Adução na polia', 'adutores', '', 'Polia', 'Tornozeleira na polia baixa. Cruze a perna à frente da outra de forma controlada.'],
  ['copenhagen', 'Prancha Copenhagen', 'adutores', 'abdomen', 'Peso corporal', 'Prancha lateral com a perna de cima apoiada no banco. Mantenha o quadril elevado.'],
  // Abdutores
  ['cadeira-abdutora', 'Cadeira abdutora', 'abdutores', 'gluteos', 'Máquina', 'Abra as pernas contra as almofadas. Tronco levemente à frente enfatiza o glúteo.'],
  ['abducao-polia', 'Abdução na polia em pé', 'abdutores', 'gluteos', 'Polia', 'Tornozeleira na polia baixa. Afaste a perna lateralmente sem inclinar o tronco.'],
  ['abducao-deitada', 'Abdução deitada', 'abdutores', 'gluteos', 'Caneleira', 'Deitada de lado. Eleve a perna de cima levemente para trás.'],
  ['monster-walk', 'Caminhada lateral com elástico', 'abdutores', 'gluteos', 'Elástico', 'Elástico acima dos joelhos, semiagachada. Dê passos laterais mantendo tensão.'],
  // Panturrilhas
  ['panturrilha-em-pe', 'Panturrilha em pé', 'panturrilhas', '', 'Máquina', 'Desça o calcanhar até alongar e suba na ponta dos pés com pausa no topo.'],
  ['panturrilha-sentada', 'Panturrilha sentada', 'panturrilhas', '', 'Máquina', 'Joelhos a 90°. Eleve os calcanhares com amplitude completa.'],
  ['panturrilha-leg', 'Panturrilha no leg press', 'panturrilhas', '', 'Máquina', 'Ponta dos pés na borda da plataforma. Empurre com os tornozelos sem flexionar os joelhos.'],
  ['panturrilha-unilateral', 'Panturrilha unilateral', 'panturrilhas', '', 'Halteres', 'Um pé no degrau, halter na mão do mesmo lado. Amplitude completa.'],
  // Costas
  ['puxada-frontal', 'Puxada frontal', 'costas', 'biceps ombros', 'Polia', 'Pegada pronada aberta. Puxe a barra até a parte alta do peito, levando os cotovelos para baixo.'],
  ['puxada-triangulo', 'Puxada com triângulo', 'costas', 'biceps', 'Polia', 'Pegada neutra. Puxe em direção ao peito com o tronco levemente inclinado.'],
  ['barra-fixa', 'Barra fixa', 'costas', 'biceps ombros', 'Peso corporal', 'Suba até o queixo passar a barra, controlando a descida. Pode usar graviton ou elástico.'],
  ['remada-curvada', 'Remada curvada', 'costas', 'biceps ombros lombar', 'Barra', 'Tronco inclinado e coluna neutra. Puxe a barra em direção ao umbigo.'],
  ['remada-baixa', 'Remada baixa', 'costas', 'biceps', 'Polia', 'Sentada, tronco firme. Puxe o triângulo até o abdômen aproximando as escápulas.'],
  ['remada-unilateral', 'Remada unilateral (serrote)', 'costas', 'biceps ombros', 'Halteres', 'Apoio no banco. Puxe o halter em direção ao quadril.'],
  ['remada-cavalinho', 'Remada cavalinho', 'costas', 'biceps ombros', 'Barra', 'Tronco inclinado sobre a barra T. Puxe em direção ao peito.'],
  ['remada-maquina', 'Remada na máquina', 'costas', 'biceps', 'Máquina', 'Peito apoiado. Puxe as alças levando os cotovelos para trás.'],
  ['pulldown-corda', 'Pulldown com corda', 'costas', 'triceps', 'Polia', 'Braços quase estendidos. Leve a corda até as coxas usando as costas.'],
  ['encolhimento', 'Encolhimento', 'costas', '', 'Halteres', 'Eleve os ombros em direção às orelhas e desça devagar.'],
  // Peito
  ['supino-reto', 'Supino reto', 'peito', 'triceps ombros', 'Barra', 'Escápulas encaixadas. Desça a barra até o peito e empurre.'],
  ['supino-reto-halteres', 'Supino reto com halteres', 'peito', 'triceps ombros', 'Halteres', 'Desça os halteres ao lado do peito e empurre aproximando no topo.'],
  ['supino-inclinado-halteres', 'Supino inclinado com halteres', 'peito', 'ombros triceps', 'Halteres', 'Banco a 30–45°. Desça controlando e empurre.'],
  ['supino-inclinado', 'Supino inclinado', 'peito', 'ombros triceps', 'Barra', 'Banco inclinado. Desça a barra na parte alta do peito.'],
  ['supino-maquina', 'Supino na máquina', 'peito', 'triceps ombros', 'Máquina', 'Ajuste as alças na altura do peito e empurre sem travar os cotovelos.'],
  ['crucifixo', 'Crucifixo com halteres', 'peito', 'ombros', 'Halteres', 'Cotovelos levemente flexionados. Abra os braços em arco e feche contraindo o peito.'],
  ['crossover', 'Crossover', 'peito', 'ombros', 'Polia', 'Polias altas. Traga as mãos à frente do corpo em arco.'],
  ['peck-deck', 'Voador (peck deck)', 'peito', 'ombros', 'Máquina', 'Feche os braços à frente do peito e controle a abertura.'],
  ['flexao', 'Flexão de braço', 'peito', 'triceps ombros abdomen', 'Peso corporal', 'Corpo alinhado. Desça o peito ao chão e empurre. Pode apoiar os joelhos.'],
  // Ombros
  ['desenvolvimento-halteres', 'Desenvolvimento com halteres', 'ombros', 'triceps', 'Halteres', 'Sentada, halteres na altura das orelhas. Empurre acima da cabeça.'],
  ['desenvolvimento-maquina', 'Desenvolvimento na máquina', 'ombros', 'triceps', 'Máquina', 'Costas apoiadas. Empurre as alças para cima.'],
  ['desenvolvimento-barra', 'Desenvolvimento militar', 'ombros', 'triceps abdomen', 'Barra', 'Em pé, barra à frente. Empurre acima da cabeça com abdômen firme.'],
  ['arnold', 'Arnold press', 'ombros', 'triceps', 'Halteres', 'Comece com palmas para você e gire enquanto empurra para cima.'],
  ['elevacao-lateral', 'Elevação lateral', 'ombros', '', 'Halteres', 'Eleve os braços lateralmente até a altura dos ombros, cotovelos levemente flexionados.'],
  ['elevacao-lateral-polia', 'Elevação lateral na polia', 'ombros', '', 'Polia', 'Polia baixa do lado oposto. Eleve o braço lateralmente.'],
  ['elevacao-frontal', 'Elevação frontal', 'ombros', 'peito', 'Halteres', 'Eleve os braços à frente até a altura dos ombros.'],
  ['crucifixo-invertido', 'Crucifixo invertido', 'ombros', 'costas', 'Máquina', 'No voador invertido, abra os braços para trás com foco no deltoide posterior.'],
  ['face-pull', 'Face pull', 'ombros', 'costas', 'Polia', 'Corda na altura do rosto. Puxe abrindo as mãos ao lado das orelhas.'],
  ['remada-alta', 'Remada alta', 'ombros', 'costas biceps', 'Barra', 'Puxe a barra até a altura do peito com cotovelos acima das mãos.'],
  // Bíceps
  ['rosca-direta', 'Rosca direta', 'biceps', '', 'Barra', 'Cotovelos junto ao corpo. Flexione sem balançar o tronco.'],
  ['rosca-alternada', 'Rosca alternada', 'biceps', '', 'Halteres', 'Alterne os braços girando a palma para cima durante a subida.'],
  ['rosca-martelo', 'Rosca martelo', 'biceps', '', 'Halteres', 'Pegada neutra. Flexione mantendo os cotovelos fixos.'],
  ['rosca-scott', 'Rosca Scott', 'biceps', '', 'Barra', 'Braços apoiados no banco Scott. Desça até quase estender.'],
  ['rosca-polia', 'Rosca na polia', 'biceps', '', 'Polia', 'Polia baixa com barra. Flexione mantendo tensão contínua.'],
  ['rosca-concentrada', 'Rosca concentrada', 'biceps', '', 'Halteres', 'Sentada, cotovelo apoiado na coxa. Flexione devagar.'],
  ['rosca-inclinada', 'Rosca inclinada', 'biceps', '', 'Halteres', 'Banco inclinado, braços estendidos atrás do tronco. Flexione.'],
  // Tríceps
  ['triceps-pulley', 'Tríceps pulley', 'triceps', '', 'Polia', 'Cotovelos junto ao corpo. Estenda os braços empurrando a barra para baixo.'],
  ['triceps-corda', 'Tríceps na corda', 'triceps', '', 'Polia', 'Estenda os braços abrindo a corda no final.'],
  ['triceps-testa', 'Tríceps testa', 'triceps', '', 'Barra', 'Deitada, desça a barra em direção à testa flexionando só os cotovelos.'],
  ['triceps-frances', 'Tríceps francês', 'triceps', '', 'Halteres', 'Halter atrás da cabeça. Estenda os braços para cima.'],
  ['triceps-coice', 'Tríceps coice', 'triceps', '', 'Halteres', 'Tronco inclinado, braço junto ao corpo. Estenda o cotovelo para trás.'],
  ['mergulho', 'Mergulho (paralelas/banco)', 'triceps', 'peito ombros', 'Peso corporal', 'Desça flexionando os cotovelos e empurre de volta.'],
  ['supino-fechado', 'Supino fechado', 'triceps', 'peito ombros', 'Barra', 'Pegada na largura dos ombros, cotovelos próximos ao corpo.'],
  // Abdômen
  ['abdominal-crunch', 'Abdominal crunch', 'abdomen', '', 'Peso corporal', 'Deitada, eleve as escápulas do chão contraindo o abdômen.'],
  ['abdominal-polia', 'Abdominal na polia', 'abdomen', '', 'Polia', 'Ajoelhada, corda atrás da cabeça. Flexione o tronco em direção ao chão.'],
  ['prancha', 'Prancha', 'abdomen', 'lombar ombros', 'Peso corporal', 'Antebraços no chão e corpo alinhado. Registre os segundos como repetições.'],
  ['elevacao-pernas', 'Elevação de pernas', 'abdomen', '', 'Peso corporal', 'Deitada ou suspensa. Eleve as pernas sem tirar a lombar do apoio.'],
  ['abdominal-bicicleta', 'Abdominal bicicleta', 'abdomen', '', 'Peso corporal', 'Alterne cotovelo em direção ao joelho oposto.'],
  ['pallof', 'Pallof press', 'abdomen', 'lombar', 'Polia', 'De lado para a polia, empurre a alça à frente resistindo à rotação.'],
  ['roda-abdominal', 'Roda abdominal', 'abdomen', 'lombar ombros', 'Peso corporal', 'Ajoelhada, role a roda à frente mantendo o abdômen firme.'],
  // Lombar
  ['hiperextensao-lombar', 'Hiperextensão lombar', 'lombar', 'gluteos posteriores', 'Peso corporal', 'No banco romano, suba até alinhar o tronco com as pernas.'],
  ['bird-dog', 'Bird dog', 'lombar', 'gluteos abdomen', 'Peso corporal', 'Em quatro apoios, estenda braço e perna opostos mantendo o quadril estável.'],
  ['superman', 'Superman', 'lombar', 'gluteos', 'Peso corporal', 'Deitada de bruços, eleve braços e pernas ao mesmo tempo.'],
].map(([id, name, primary, sec, equipment, instructions]) => ({
  id, name, primary, secondary: sec ? sec.split(' ') : [], equipment, instructions, image: exerciseAnim(id), builtin: true,
}));

// Treinos iniciais (podem ser editados ou excluídos). Sem histórico inventado.
function seedWorkouts() {
  const it = (exerciseId, sets, repMin, repMax, rest) => ({ id: uid(), exerciseId, sets, repMin, repMax, load: '', rest, notes: '' });
  return [
    {
      id: uid(), name: 'Treino A', division: 'Inferiores', description: 'Ênfase em glúteos e quadríceps.',
      primary: ['gluteos', 'quadriceps'], secondary: ['adutores', 'panturrilhas'], notes: '',
      items: [
        it('hip-thrust', 4, 8, 12, 120), it('agachamento-livre', 4, 8, 10, 120), it('leg-press-45', 3, 10, 12, 90),
        it('agachamento-bulgaro', 3, 10, 12, 90), it('cadeira-extensora', 3, 12, 15, 60), it('cadeira-abdutora', 3, 12, 15, 60),
        it('panturrilha-em-pe', 4, 12, 15, 45),
      ],
    },
    {
      id: uid(), name: 'Treino B', division: 'Superiores', description: 'Costas, ombros e bíceps.',
      primary: ['costas', 'ombros', 'biceps'], secondary: [], notes: '',
      items: [
        it('puxada-frontal', 4, 8, 12, 90), it('remada-baixa', 3, 10, 12, 90), it('remada-unilateral', 3, 10, 12, 75),
        it('desenvolvimento-halteres', 3, 8, 12, 90), it('elevacao-lateral', 4, 12, 15, 60), it('face-pull', 3, 12, 15, 60),
        it('rosca-direta', 3, 10, 12, 60), it('rosca-martelo', 3, 10, 12, 60),
      ],
    },
    {
      id: uid(), name: 'Treino C', division: 'Inferiores', description: 'Ênfase em posteriores e glúteos.',
      primary: ['posteriores', 'gluteos'], secondary: ['adutores', 'lombar'], notes: '',
      items: [
        it('stiff', 4, 8, 10, 120), it('mesa-flexora', 4, 10, 12, 75), it('elevacao-pelvica-maquina', 3, 10, 12, 90),
        it('afundo', 3, 10, 12, 90), it('coice-polia', 3, 12, 15, 45), it('cadeira-adutora', 3, 12, 15, 60),
        it('hiperextensao-gluteo', 3, 12, 15, 60), it('panturrilha-sentada', 4, 12, 15, 45),
      ],
    },
    {
      id: uid(), name: 'Treino D', division: 'Superiores', description: 'Peito, tríceps e ombros.',
      primary: ['peito', 'triceps', 'ombros'], secondary: ['abdomen'], notes: '',
      items: [
        it('supino-inclinado-halteres', 4, 8, 12, 90), it('supino-maquina', 3, 10, 12, 90), it('crossover', 3, 12, 15, 60),
        it('desenvolvimento-maquina', 3, 8, 12, 90), it('elevacao-lateral-polia', 3, 12, 15, 60), it('triceps-corda', 3, 10, 12, 60),
        it('triceps-frances', 3, 10, 12, 60), it('abdominal-polia', 3, 12, 15, 45),
      ],
    },
  ];
}
