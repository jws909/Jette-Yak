package com.app.easydrug.service.impl;
import java.net.URI;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import com.app.easydrug.dao.EasyDrugDao;
import com.app.easydrug.dto.MedicationEasyApiResponse;
import com.app.easydrug.dto.MedicationEasyDto;
import com.app.easydrug.service.EasyDrugService;

@Service
public class EasyDrugServiceImpl implements EasyDrugService {
    private final EasyDrugDao medicationDao;
    public EasyDrugServiceImpl(EasyDrugDao medicationDao) { this.medicationDao = medicationDao; }
	/*
	 * =========================================================
	 * 식약처 e약은요 API
	 * =========================================================
	 */
	private static final String EASY_DRUG_API_URL = "https://apis.data.go.kr/1471000/" + "DrbEasyDrugInfoService/"
			+ "getDrbEasyDrugList";

	/*
	 * =========================================================
	 * e약은요 API URI 생성
	 * =========================================================
	 *
	 * 문자열 + 연산으로 URL을 만들지 않고
	 * UriComponentsBuilder를 이용한다.
	 *
	 * 장점:
	 *
	 * 1. Query Parameter 관리가 편하다.
	 * 2. URL Encoding을 Spring에 맡길 수 있다.
	 * 3. 검색 조건이 추가되어도 유지보수가 쉽다.
	 *
	 * 중요:
	 *
	 * serviceKey는 공공데이터포털에서 제공하는
	 * "Decoding 인증키"를 사용하는 것을 권장한다.
	 *
	 * 이미 %2F, %2B 등으로 Encoding된 인증키를 넣고
	 * encode()를 또 실행하면 이중 인코딩될 수 있다.
	 */
	private URI createEasyDrugUri(int pageNo, int numOfRows) {

		return UriComponentsBuilder.fromHttpUrl(EASY_DRUG_API_URL)

				/*
				 * 공공데이터포털 인증키
				 */
				.queryParam("serviceKey", "ff08944668902fd4f34be4001187e8d8ecc60561a6e9a3684efc92f1492c15d9")

				/*
				 * 페이지 번호
				 */
				.queryParam("pageNo", pageNo)

				/*
				 * 페이지당 데이터 개수
				 */
				.queryParam("numOfRows", numOfRows)

				/*
				 * JSON 요청
				 */
				.queryParam("type", "json")

				/*
				 * URI 생성 후 Encoding
				 */
				.build().encode().toUri();
	}

	@Override
	public int syncEasyMedicationTest() {

		/*
		 * =========================================================
		 * e약은요 100건 테스트
		 * =========================================================
		 */

		int pageNo = 1;

		int numOfRows = 100;

		/*
		 * URI 생성
		 */
		URI targetUri = createEasyDrugUri(pageNo, numOfRows);

		/*
		 * API 호출
		 */
		RestTemplate restTemplate = new RestTemplate();

		MedicationEasyApiResponse response = restTemplate.getForObject(targetUri, MedicationEasyApiResponse.class);

		/*
		 * 응답이 없는 경우
		 */
		if (response == null) {

			throw new RuntimeException("e약은요 API 응답이 없습니다.");
		}

		/*
		 * HEADER 확인
		 */
		if (response.getHeader() == null) {

			throw new RuntimeException("e약은요 API Header가 없습니다.");
		}

		/*
		 * API 오류 확인
		 */
		if (!"00".equals(response.getHeader().getResultCode())) {

			throw new RuntimeException("e약은요 API 오류 : " + response.getHeader().getResultCode() + " / "
					+ response.getHeader().getResultMsg());
		}

		/*
		 * BODY 확인
		 */
		if (response.getBody() == null) {

			throw new RuntimeException("e약은요 API Body가 없습니다.");
		}

		List<MedicationEasyDto> medications = response.getBody().getItems();

		if (medications == null || medications.isEmpty()) {

			return 0;
		}

		int processedCount = 0;

		int updatedCount = 0;

		/*
		 * =====================================================
		 * 100건 처리
		 * =====================================================
		 */
		for (MedicationEasyDto medication : medications) {

			/*
			 * ITEM_SEQ가 없으면
			 * MEDICATIONS와 연결 불가능
			 */
			if (medication.getItemSeq() == null || medication.getItemSeq().trim().isEmpty()) {

				continue;
			}

			/*
			 * 기존 MEDICATIONS 정보 UPDATE
			 */
			int result = medicationDao.updateEasyMedication(medication);

			processedCount++;

			updatedCount += result;
		}

		System.out.println("========================================");

		System.out.println("e약은요 전체 정보 수 : " + response.getBody().getTotalCount());

		System.out.println("API에서 이번에 읽은 데이터 : " + processedCount);

		System.out.println("실제 UPDATE된 데이터 : " + updatedCount);

		System.out.println("========================================");

		return processedCount;
	}

	@Override
	public int syncEasyMedicationAll() {

		/*
		 * =========================================================
		 * e약은요 전체 적재
		 * =========================================================
		 *
		 * 100건씩 전체 페이지를 조회한다.
		 *
		 * 약 4,779건이라면
		 * 약 48번의 API 요청으로 완료된다.
		 * =========================================================
		 */

		int numOfRows = 100;

		/*
		 * API 전체 데이터 개수
		 */
		int totalCount = 0;

		/*
		 * 전체 페이지 수
		 */
		int totalPages = 0;

		/*
		 * API에서 읽은 총 데이터
		 */
		int totalProcessedCount = 0;

		/*
		 * DB에 실제 UPDATE된 데이터
		 */
		int totalUpdatedCount = 0;

		RestTemplate restTemplate = new RestTemplate();

		/*
		 * =====================================================
		 * 첫 번째 페이지 조회
		 * =====================================================
		 *
		 * totalCount를 알아내기 위해 먼저 호출한다.
		 */
		URI firstUri = createEasyDrugUri(1, numOfRows);

		MedicationEasyApiResponse firstResponse = restTemplate.getForObject(firstUri, MedicationEasyApiResponse.class);

		/*
		 * 응답 검증
		 */
		if (firstResponse == null || firstResponse.getHeader() == null || firstResponse.getBody() == null) {

			throw new RuntimeException("e약은요 API 응답이 올바르지 않습니다.");
		}

		/*
		 * API 오류 확인
		 */
		if (!"00".equals(firstResponse.getHeader().getResultCode())) {

			throw new RuntimeException("e약은요 API 오류 : " + firstResponse.getHeader().getResultCode() + " / "
					+ firstResponse.getHeader().getResultMsg());
		}

		/*
		 * 전체 데이터 개수
		 */
		totalCount = firstResponse.getBody().getTotalCount();

		/*
		 * 전체 페이지 계산
		 */
		totalPages = (totalCount + numOfRows - 1) / numOfRows;

		System.out.println("========================================");

		System.out.println("e약은요 전체 동기화 시작");

		System.out.println("전체 데이터 : " + totalCount + "건");

		System.out.println("전체 페이지 : " + totalPages + "페이지");

		System.out.println("========================================");

		/*
		 * =====================================================
		 * 전체 페이지 반복
		 * =====================================================
		 */
		for (int pageNo = 1; pageNo <= totalPages; pageNo++) {

			/*
			 * 현재 페이지 URI 생성
			 */
			URI targetUri = createEasyDrugUri(pageNo, numOfRows);

			/*
			 * API 요청
			 */
			MedicationEasyApiResponse response = restTemplate.getForObject(targetUri, MedicationEasyApiResponse.class);

			/*
			 * 응답 검증
			 */
			if (response == null || response.getHeader() == null || response.getBody() == null) {

				throw new RuntimeException(pageNo + "페이지 API 응답 오류");
			}

			/*
			 * resultCode 확인
			 */
			if (!"00".equals(response.getHeader().getResultCode())) {

				throw new RuntimeException(pageNo + "페이지 API 오류 : " + response.getHeader().getResultCode() + " / "
						+ response.getHeader().getResultMsg());
			}

			List<MedicationEasyDto> medications = response.getBody().getItems();

			/*
			 * 해당 페이지에 데이터가 없으면 종료
			 */
			if (medications == null || medications.isEmpty()) {

				break;
			}

			/*
			 * 현재 페이지에서
			 * 실제 UPDATE된 데이터 수
			 */
			int pageUpdatedCount = 0;

			/*
			 * =================================================
			 * 현재 페이지 데이터 처리
			 * =================================================
			 */
			for (MedicationEasyDto medication : medications) {

				if (medication.getItemSeq() == null || medication.getItemSeq().trim().isEmpty()) {

					continue;
				}

				int result = medicationDao.updateEasyMedication(medication);

				totalProcessedCount++;

				pageUpdatedCount += result;

				totalUpdatedCount += result;
			}

			/*
			 * 페이지별 진행상황 출력
			 */
			System.out.println("[" + pageNo + " / " + totalPages + "] " + "읽음 : " + medications.size() + "건"
					+ " / UPDATE : " + pageUpdatedCount + "건" + " / 누적 : " + totalProcessedCount + "건");
		}

		/*
		 * =====================================================
		 * 완료
		 * =====================================================
		 */
		System.out.println("========================================");

		System.out.println("e약은요 전체 동기화 완료");

		System.out.println("API 전체 데이터 : " + totalCount + "건");

		System.out.println("읽은 데이터 : " + totalProcessedCount + "건");

		System.out.println("실제 UPDATE : " + totalUpdatedCount + "건");

		System.out.println("========================================");

		return totalProcessedCount;
	}
}