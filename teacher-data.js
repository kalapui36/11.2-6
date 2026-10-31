// 교사 화면에서만 불러오는 파일. 학생 화면(index.html)에서는 절대 불러오지 않는다.

const TEACHER_PIN = '0000';   // 교사 화면 진입용 간단 PIN

// 자료별 주제 분류(정답). 해결 노력 자료(type: 'effort')는 빈 배열.
const ITEM_TOPICS = {
  'tuvalu':        ['climate', 'refugee'],
  'sea-turtle':    ['ecosystem'],
  'oil-price':     ['resource'],
  'solar-village': [],
};
