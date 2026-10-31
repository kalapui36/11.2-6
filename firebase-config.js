// Firebase 설정값 (Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정 및 구성)
// 이 값은 원래 웹페이지에 공개되도록 만들어진 값이다. 데이터 보호는 database.rules.json이 맡는다.
// apiKey나 databaseURL이 비어 있으면 Firebase 없이 이 브라우저 안에만 저장하는 시험 모드로 동작한다.
const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
