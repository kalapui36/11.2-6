// 자료 카드 데이터와 설정 (학생 화면과 교사 화면이 함께 사용)
// 주의: 이 파일에는 자료의 주제 분류(정답)를 넣지 않는다. 분류는 teacher-data.js에만 둔다.

const GROUPS = [
  { id: 'resource',  name: '자원 및 에너지 문제' },
  { id: 'climate',   name: '기후변화 문제' },
  { id: 'ecosystem', name: '생태계 파괴 문제' },
  { id: 'refugee',   name: '난민 문제' },
];
const MEMBERS_PER_GROUP = 5;             // 1~5번
const SUPPORT_STUDENTS = ['climate-2'];   // 문장 틀을 미리 보여 줄 학생
const SENTENCE_FRAME = '___에서 ___ 문제가 일어나고 있습니다. ';
const SHUFFLE_SEED = 1102;               // 자료 섞는 순서. 모든 학생이 같은 순서로 본다.

// type: 'problem'(문제 자료) 또는 'effort'(해결 노력 자료)
// 아래는 1단계 화면 확인용 예시 자료. 5단계에서 실제 자료로 바꾼다.
const ITEMS = [
  {
    id: 'tuvalu',
    title: '섬이 바다에 잠기고 있어요',
    image: 'images/sample-tuvalu.svg',
    body: '(예시 자료) 남태평양의 작은 섬나라에서는 바닷물이 점점 높아지면서 해안의 땅이 조금씩 사라지고 있습니다. 바닷물이 밭과 우물로 스며들어 농사를 짓거나 마실 물을 구하기 어려워졌습니다. 살 곳을 잃을까 걱정하는 주민들이 다른 나라로 옮겨 가는 방법을 고민하고 있습니다.',
    source: '예시 출처',
    date: '2026. 10.',
    type: 'problem',
  },
  {
    id: 'sea-turtle',
    title: '바다거북의 배 속에서 나온 것',
    image: 'images/sample-turtle.svg',
    body: '(예시 자료) 바닷가에서 구조된 바다거북의 배 속에서 비닐과 플라스틱 조각이 발견되었습니다. 바다거북은 떠다니는 비닐봉지를 먹이인 해파리로 착각해 삼키기도 합니다. 바다로 흘러드는 쓰레기 때문에 많은 바다 생물이 위험에 처해 있습니다.',
    source: '예시 출처',
    date: '2026. 10.',
    type: 'problem',
  },
  {
    id: 'oil-price',
    title: '기름값이 오르면 생기는 일',
    image: 'images/sample-oil.svg',
    body: '(예시 자료) 석유는 한번 쓰면 다시 만들 수 없고 묻혀 있는 양도 정해져 있습니다. 석유를 두고 나라 사이의 갈등이 생기면 기름값이 크게 오르기도 합니다. 기름값이 오르면 교통비와 물건값도 함께 올라 많은 사람의 생활이 어려워집니다.',
    source: '예시 출처',
    date: '2026. 10.',
    type: 'problem',
  },
  {
    id: 'solar-village',
    title: '햇빛으로 불을 밝힌 마을',
    image: 'images/sample-solar.svg',
    body: '(예시 자료) 전기가 들어오지 않던 한 마을에 태양광 발전 시설이 세워졌습니다. 이제 밤에도 불을 켜고 공부할 수 있게 되었습니다. 마을 사람들은 직접 시설을 관리하는 방법을 배우고 있습니다.',
    source: '예시 출처',
    date: '2026. 10.',
    type: 'effort',
  },
];
