package com.app.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.app.dao.MainDAO;
import com.app.dto.medications.MedicationsDTO;

@Service
public class MainServiceImpl implements MainService {
	
	@Autowired
	MainDAO mainDAO;

	@Override
	public List<MedicationsDTO> dbTest() {
		List<MedicationsDTO> test = mainDAO.dbTest();
		return test;
	}

}
