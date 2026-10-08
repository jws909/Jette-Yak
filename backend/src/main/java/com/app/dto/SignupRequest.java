package com.app.dto;

/**
 * 회원가입 요청 바디.
 * users 테이블 기준: sex, birthdate, isPregnant는 NOT NULL이라 필수입니다.
 * birthdate는 "yyyy-MM-dd" 형식 문자열로 받습니다.
 * isPregnant는 0(False) 또는 1(True)로 받습니다. sex가 'M'이면 프론트에서 0으로 고정해 보내주세요.
 */
public class SignupRequest {

    private String loginId;
    private String password;
    private String email;
    private String nickname;
    private String sex;         // 'M' 또는 'F'
    private String birthdate;   // "yyyy-MM-dd"
    private Integer isPregnant; // 0 또는 1
    private String tel;         // optional

    public SignupRequest() {
    }

    public String getLoginId() {
        return loginId;
    }

    public void setLoginId(String loginId) {
        this.loginId = loginId;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getSex() {
        return sex;
    }

    public void setSex(String sex) {
        this.sex = sex;
    }

    public String getBirthdate() {
        return birthdate;
    }

    public void setBirthdate(String birthdate) {
        this.birthdate = birthdate;
    }

    public Integer getIsPregnant() {
        return isPregnant;
    }

    public void setIsPregnant(Integer isPregnant) {
        this.isPregnant = isPregnant;
    }

    public String getTel() {
        return tel;
    }

    public void setTel(String tel) {
        this.tel = tel;
    }
}
