package com.app.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * users 테이블 매핑 객체.
 */
public class User {

    private Long userId;
    private String loginId;
    private String passwordHash;
    private String email;
    private String nickname;
    private String profileImageUrl;
    private Integer pushEnabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime medUpdatedAt;
    private String role;
    private Long familyId;
    private LocalDate birthdate;
    private String sex;
    private Integer isPregnant;
    private String tel;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getLoginId() {
        return loginId;
    }

    public void setLoginId(String loginId) {
        this.loginId = loginId;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
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

    public String getProfileImageUrl() {
        return profileImageUrl;
    }

    public void setProfileImageUrl(String profileImageUrl) {
        this.profileImageUrl = profileImageUrl;
    }

    public Integer getPushEnabled() {
        return pushEnabled;
    }

    public void setPushEnabled(Integer pushEnabled) {
        this.pushEnabled = pushEnabled;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LocalDateTime getMedUpdatedAt() {
        return medUpdatedAt;
    }

    public void setMedUpdatedAt(LocalDateTime medUpdatedAt) {
        this.medUpdatedAt = medUpdatedAt;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Long getFamilyId() {
        return familyId;
    }

    public void setFamilyId(Long familyId) {
        this.familyId = familyId;
    }

    public LocalDate getBirthdate() {
        return birthdate;
    }

    public void setBirthdate(LocalDate birthdate) {
        this.birthdate = birthdate;
    }

    public String getSex() {
        return sex;
    }

    public void setSex(String sex) {
        this.sex = sex;
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
