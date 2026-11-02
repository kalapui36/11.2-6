// 교사 화면에서만 불러오는 파일. 학생 화면(index.html)에서는 절대 불러오지 않는다.

const TEACHER_PIN = '4021';   // 교사 화면 진입용 간단 PIN

// 자료별 주제 분류(정답). 해결 노력 자료(type: 'effort')는 빈 배열.
// 두 주제에 걸치는 자료는 수업 지도안의 정리 활동(두 문제에 함께 해당하는 사례)에 쓴다.
const ITEM_TOPICS = {
  // 자원 및 에너지
  'water':            ['resource'],
  'rio-grande':       ['resource'],
  'europe-gas':       ['resource'],
  'nile':             ['resource'],
  'rare-earth':       ['resource'],
  'europe-water':     ['resource'],
  'day-zero':         ['resource', 'climate'],
  'aral':             ['ecosystem', 'resource'],
  // 기후변화
  'tuvalu':           ['climate', 'refugee'],
  'hottest-year':     ['climate'],
  'korea-summer':     ['climate'],
  'apple':            ['climate'],
  'blatten':          ['climate'],
  'pakistan':         ['climate', 'refugee'],
  'coral':            ['climate', 'ecosystem'],
  'wildfire':         ['climate', 'ecosystem'],
  // 생태계 파괴
  'ghana-clothes':    ['ecosystem'],
  'sea-turtle':       ['ecosystem'],
  'garbage-patch':    ['ecosystem'],
  'wildlife':         ['ecosystem'],
  'bees':             ['ecosystem'],
  'amazon':           ['ecosystem'],
  // 난민
  'displaced':        ['refugee'],
  'sudan':            ['refugee'],
  'rohingya':         ['refugee'],
  'ukraine':          ['refugee'],
  'climate-refugees': ['refugee', 'climate'],
  // 해결 노력
  'ozone':            [],
  'renewables':       [],
  'paris':            [],
  'bear':             [],
  'ocean-cleanup':    [],
  'refugee-team':     [],
};

// 교실 자리 배치(칠판 모드 '우리 모둠 자리'와 활동3 화면의 그림). 실제 교실에 맞게 바꾸면 된다.
//   home:   원래 모둠 자리. col(가로 칸), row(세로 줄)는 전자칠판에서 본 위치. 1부터 시작.
//   jigsaw: 활동3 같은 번호 모둠 자리(1번 모둠~5번 모둠).
const SEAT_MAP = {
  home: [
    { group: 'resource',  col: 1, row: 1 },
    { group: 'climate',   col: 2, row: 1 },
    { group: 'ecosystem', col: 1, row: 2 },
    { group: 'refugee',   col: 2, row: 2 },
  ],
  // 우리 반 아치형 배치(전자칠판에서 볼 때)
  //   1              5
  //   2      3       4
  jigsaw: [
    { team: 1, col: 1, row: 1 },
    { team: 5, col: 3, row: 1 },
    { team: 2, col: 1, row: 2 },
    { team: 3, col: 2, row: 2 },
    { team: 4, col: 3, row: 2 },
  ],
};
