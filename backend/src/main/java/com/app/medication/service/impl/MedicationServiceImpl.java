package com.app.medication.service.impl;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import com.app.medication.dao.MedicationDao;
import com.app.medication.dto.MedicationPermitApiResponse;
import com.app.medication.dto.MedicationPermitDto;
import com.app.medication.service.MedicationService;

@Service
public class MedicationServiceImpl implements MedicationService {

	private final MedicationDao medicationDao;

	@Autowired
	public MedicationServiceImpl(MedicationDao medicationDao) {

		this.medicationDao = medicationDao;
	}

	/*
	 * 테스트 데이터 10건을 하나의 트랜잭션으로 처리
	 */
	@Transactional
	@Override
	public int syncPermitTest() {

		/*
		 * ============================================
		 * 1. 테스트용 API 조회 조건
		 * ============================================
		 *
		 * 처음부터 42,986건을 모두 넣지 않고
		 * 1페이지 10건으로 테스트한다.
		 */
		int pageNo = 1;

		int numOfRows = 100;

		/*
		 * ============================================
		 * 2. API 주소
		 * ============================================
		 *
		 * 반드시 네가 현재 실제 호출해서
		 * totalCount=42986을 확인한
		 * "의약품 제품 허가정보" API 주소를 넣는다.
		 *
		 * ServiceKey도 네가 실제 성공했던 키를 사용한다.
		 */
		String url = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07"
				+ "?ServiceKey=ff08944668902fd4f34be4001187e8d8ecc60561a6e9a3684efc92f1492c15d9" + "&pageNo=" + pageNo
				+ "&numOfRows=" + numOfRows + "&type=json";

		/*
		 * Spring에서 외부 HTTP API를 호출하기 위한 객체
		 */
		RestTemplate restTemplate = new RestTemplate();

		/*
		 * ============================================
		 * 3. 식약처 API 호출
		 * ============================================
		 *
		 * JSON 응답을 Jackson이 자동으로
		 * MedicationPermitApiResponse 객체로 변환한다.
		 */
		MedicationPermitApiResponse response = restTemplate.getForObject(url, MedicationPermitApiResponse.class);

		/*
		 * 응답 자체가 없는 경우
		 */
		if (response == null) {

			System.out.println("식약처 API 응답이 없습니다.");

			return 0;
		}

		/*
		 * BODY가 없는 경우
		 */
		if (response.getBody() == null) {

			System.out.println("식약처 API body가 없습니다.");

			return 0;
		}

		/*
		 * ============================================
		 * 4. API 결과코드 확인
		 * ============================================
		 *
		 * 정상:
		 *
		 * resultCode = "00"
		 * resultMsg = "NORMAL SERVICE."
		 */
		if (response.getHeader() == null || !"00".equals(response.getHeader().getResultCode())) {

			System.out.println("식약처 API 호출 실패");

			if (response.getHeader() != null) {

				System.out.println("resultCode : " + response.getHeader().getResultCode());

				System.out.println("resultMsg : " + response.getHeader().getResultMsg());
			}

			return 0;
		}

		/*
		 * ============================================
		 * 5. 실제 의약품 목록 가져오기
		 * ============================================
		 */
		List<MedicationPermitDto> medications = response.getBody().getItems();

		if (medications == null || medications.isEmpty()) {

			System.out.println("조회된 의약품이 없습니다.");

			return 0;
		}

		/*
		 * API에서 몇 건을 읽었는지
		 */
		int processedCount = 0;

		/*
		 * DB에서 실제 INSERT 또는 UPDATE된 건수
		 */
		int changedCount = 0;

		/*
		 * ============================================
		 * 6. 의약품 DB 저장
		 * ============================================
		 */
		for (MedicationPermitDto medication : medications) {

			/*
			 * DB에 없는 약:
			 * INSERT → 1
			 *
			 * DB에 있고 내용 변경:
			 * UPDATE → 1
			 *
			 * DB에 있고 내용 동일:
			 * 아무 작업 없음 → 0
			 */
			int result = medicationDao.mergePermitMedication(medication);

			processedCount++;

			changedCount += result;
		}

		/*
		 * ============================================
		 * 7. 결과 확인
		 * ============================================
		 */
		System.out.println("======================================");

		System.out.println("식약처 전체 허가정보 수 : " + response.getBody().getTotalCount());

		System.out.println("API에서 이번에 읽은 데이터 : " + processedCount);

		System.out.println("실제 INSERT / UPDATE된 데이터 : " + changedCount);

		System.out.println("현재 MEDICATIONS 전체 데이터 : " + medicationDao.countMedications());

		System.out.println("======================================");

		/*
		 * 화면에는 이번에 읽은 데이터 수를 반환
		 */
		return processedCount;
	}

	@Override
	public int syncPermitAll() {

		/*
		 * =========================================================
		 * 식약처 의약품 제품 허가정보 전체 적재
		 * =========================================================
		 *
		 * 한 번에 100건씩 API를 호출한다.
		 *
		 * 예)
		 * 전체 데이터 : 42,985건
		 * 페이지당    : 100건
		 *
		 * 총 페이지 수:
		 * 약 430페이지
		 *
		 * pageNo
		 * 1 → 2 → 3 → ... → 마지막 페이지
		 *
		 * 각 데이터는 DAO의 MERGE문으로 전달된다.
		 *
		 * DB에 없으면 INSERT
		 * DB에 있고 내용이 변경됐으면 UPDATE
		 * DB에 있고 내용이 같으면 아무 작업도 하지 않는다.
		 * =========================================================
		 */

		// API 한 페이지에서 가져올 데이터 수
		int numOfRows = 100;

		// 첫 페이지부터 시작
		int pageNo = 1;

		// API 전체 데이터 개수
		int totalCount = 0;

		// 전체 페이지 수
		int totalPages = 0;

		// API에서 읽은 전체 데이터 개수
		int totalProcessedCount = 0;

		// 실제 INSERT / UPDATE된 개수
		int totalChangedCount = 0;

		/*
		 * RestTemplate은 반복문 밖에서 한 번만 생성한다.
		 *
		 * 페이지마다 새로 만들 필요가 없다.
		 */
		RestTemplate restTemplate = new RestTemplate();

		/*
		 * =========================================================
		 * 첫 번째 페이지 호출
		 * =========================================================
		 *
		 * 첫 페이지 응답을 통해 totalCount를 알아낸다.
		 */
		String firstUrl = "https://apis.data.go.kr/1471000/" + "DrugPrdtPrmsnInfoService07/" + "getDrugPrdtPrmsnInq07"
				+ "?ServiceKey=" + "ff08944668902fd4f34be4001187e8d8ecc60561a6e9a3684efc92f1492c15d9" + "&pageNo="
				+ pageNo + "&numOfRows=" + numOfRows + "&type=json";

		MedicationPermitApiResponse firstResponse = restTemplate.getForObject(firstUrl,
				MedicationPermitApiResponse.class);

		/*
		 * 응답 자체가 없는 경우
		 */
		if (firstResponse == null) {

			throw new RuntimeException("식약처 허가정보 API 응답이 없습니다.");
		}

		/*
		 * API header가 없는 경우
		 */
		if (firstResponse.getHeader() == null) {

			throw new RuntimeException("식약처 허가정보 API Header가 없습니다.");
		}

		/*
		 * resultCode가 00이 아니면
		 * 정상 응답이 아니므로 중단한다.
		 */
		if (!"00".equals(firstResponse.getHeader().getResultCode())) {

			throw new RuntimeException("식약처 API 오류 : " + firstResponse.getHeader().getResultCode() + " / "
					+ firstResponse.getHeader().getResultMsg());
		}

		/*
		 * body가 없는 경우
		 */
		if (firstResponse.getBody() == null) {

			throw new RuntimeException("식약처 허가정보 API Body가 없습니다.");
		}

		/*
		 * 전체 데이터 개수
		 *
		 * 예)
		 * 42,985
		 */
		totalCount = firstResponse.getBody().getTotalCount();

		/*
		 * 전체 페이지 수 계산
		 *
		 * 42,985건 / 100건
		 *
		 * 단순 나누기하면 429가 나오지만
		 * 마지막 85건이 있기 때문에
		 * 실제로는 430페이지가 필요하다.
		 */
		totalPages = (totalCount + numOfRows - 1) / numOfRows;

		System.out.println("==============================================");

		System.out.println("식약처 허가정보 전체 적재 시작");

		System.out.println("전체 데이터 : " + totalCount + "건");

		System.out.println("페이지당 데이터 : " + numOfRows + "건");

		System.out.println("전체 페이지 : " + totalPages + "페이지");

		System.out.println("==============================================");

		/*
		 * =========================================================
		 * 전체 페이지 반복
		 * =========================================================
		 */
		for (pageNo = 1; pageNo <= totalPages; pageNo++) {

			/*
			 * 현재 페이지 URL 생성
			 */
			String url = "https://apis.data.go.kr/1471000/" + "DrugPrdtPrmsnInfoService07/" + "getDrugPrdtPrmsnInq07"
					+ "?ServiceKey=" + "ff08944668902fd4f34be4001187e8d8ecc60561a6e9a3684efc92f1492c15d9" + "&pageNo="
					+ pageNo + "&numOfRows=" + numOfRows + "&type=json";

			/*
			 * 현재 페이지 API 호출
			 */
			MedicationPermitApiResponse response = restTemplate.getForObject(url, MedicationPermitApiResponse.class);

			/*
			 * 응답이 비정상인 경우
			 *
			 * 잘못된 데이터를 처리하지 않고
			 * 즉시 전체 적재를 중단한다.
			 */
			if (response == null || response.getHeader() == null || response.getBody() == null) {

				throw new RuntimeException(pageNo + "페이지 API 응답이 올바르지 않습니다.");
			}

			/*
			 * API 자체 오류 확인
			 */
			if (!"00".equals(response.getHeader().getResultCode())) {

				throw new RuntimeException(pageNo + "페이지 API 오류 : " + response.getHeader().getResultCode() + " / "
						+ response.getHeader().getResultMsg());
			}

			/*
			 * 현재 페이지의 의약품 목록
			 */
			List<MedicationPermitDto> medications = response.getBody().getItems();

			/*
			 * 데이터가 없으면
			 * 더 이상 처리할 필요가 없다.
			 */
			if (medications == null || medications.isEmpty()) {

				System.out.println(pageNo + "페이지 데이터가 없습니다.");

				break;
			}

			/*
			 * 현재 페이지에서 실제로
			 * INSERT / UPDATE된 데이터 개수
			 */
			int pageChangedCount = 0;

			/*
			 * =====================================================
			 * 현재 페이지의 의약품 100건 처리
			 * =====================================================
			 */
			for (MedicationPermitDto medication : medications) {

				/*
				 * ITEM_SEQ가 없는 데이터는
				 * PK로 사용할 수 없으므로 저장하지 않는다.
				 */
				if (medication.getItemSeq() == null || medication.getItemSeq().trim().isEmpty()) {

					continue;
				}

				/*
				 * MyBatis MERGE 실행
				 *
				 * 신규 데이터
				 * → INSERT
				 *
				 * 기존 데이터 + 변경됨
				 * → UPDATE
				 *
				 * 기존 데이터 + 동일함
				 * → 0
				 */
				int result = medicationDao.mergePermitMedication(medication);

				/*
				 * API에서 정상적으로 읽어서
				 * 처리한 데이터 수
				 */
				totalProcessedCount++;

				/*
				 * 실제 INSERT / UPDATE된 데이터 수
				 */
				pageChangedCount += result;

				totalChangedCount += result;
			}

			/*
			 * 페이지마다 진행 상황 표시
			 *
			 * 43,000건을 한 줄씩 출력하면
			 * 콘솔이 너무 복잡해지기 때문에
			 * 페이지 단위로만 출력한다.
			 */
			System.out.println("[" + pageNo + " / " + totalPages + "] " + "읽음 : " + medications.size() + "건"
					+ " / 변경 : " + pageChangedCount + "건" + " / 누적 처리 : " + totalProcessedCount + "건");
		}

		/*
		 * =========================================================
		 * 전체 적재 완료
		 * =========================================================
		 */
		int dbCount = medicationDao.countMedications();

		System.out.println("==============================================");

		System.out.println("식약처 허가정보 전체 적재 완료");

		System.out.println("API 전체 허가정보 : " + totalCount + "건");

		System.out.println("이번 실행에서 읽은 데이터 : " + totalProcessedCount + "건");

		System.out.println("실제 INSERT / UPDATE : " + totalChangedCount + "건");

		System.out.println("현재 MEDICATIONS 데이터 : " + dbCount + "건");

		System.out.println("==============================================");

		/*
		 * 전체 처리 건수를 Controller에 반환
		 */
		return totalProcessedCount;
	}

}
