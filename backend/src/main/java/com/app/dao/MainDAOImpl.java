package com.app.dao;

import java.util.List;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.app.dto.medications.MedicationsDTO;

@Repository
public class MainDAOImpl implements MainDAO {
	
	@Autowired
	SqlSessionTemplate sqlSessionTemplate;

	@Override
	public List<MedicationsDTO> dbTest() {
		List<MedicationsDTO> test = sqlSessionTemplate.selectList("main_mapper.dbTest");
		return test;
	}

}
