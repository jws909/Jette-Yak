package com.app.controller;

import java.util.List;


import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;


import com.app.dto.medications.MedicationsDTO;
import com.app.service.MainService;

@Controller
public class MainController {
	
	@Autowired
	MainService mainService;

	@RequestMapping("/main")
	public String main() {
		
		List<MedicationsDTO> test = mainService.dbTest();

		for(MedicationsDTO dto : test)
			System.out.println(dto);
		
		return "main";
	}
}