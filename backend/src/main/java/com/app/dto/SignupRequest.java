package com.app.dto;

/**
 * 회원가입 요청 바디.
 * users 테이블 스펙 기준: sex, birthdate는 NOT NULL이라 필수입니다.
 * birthdate는 "yyyy-MM-dd" 형식 문자열로 받습니다.
 */
public class SignupRequest {

    private String loginId;
    private String password;
    private String email;
    private String nickname;
    private String sex;         // 'M' 또는 'F' 등 한 글자
    private String birthdate;   // "yyyy-MM-dd"
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

    public String getTel() {
        return tel;
    }

    public void setTel(String tel) {
        this.tel = tel;
    }
}
