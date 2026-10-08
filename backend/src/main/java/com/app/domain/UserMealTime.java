package com.app.domain;

import java.time.LocalDateTime;

/**
 * user_meal_times 테이블 매핑 도메인 객체 (평일/주말 맞춤 식사 시간)
 */
public class UserMealTime {

    private Long id;
    private Long userId;
    private String dayType; // "WEEKDAY", "WEEKEND"
    private String breakfastTime;
    private String lunchTime;
    private String dinnerTime;
    private String bedtime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public UserMealTime() {}

    public UserMealTime(Long userId, String dayType, String breakfastTime, String lunchTime, String dinnerTime, String bedtime) {
        this.userId = userId;
        this.dayType = dayType;
        this.breakfastTime = breakfastTime;
        this.lunchTime = lunchTime;
        this.dinnerTime = dinnerTime;
        this.bedtime = bedtime;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getDayType() {
        return dayType;
    }

    public void setDayType(String dayType) {
        this.dayType = dayType;
    }

    public String getBreakfastTime() {
        return breakfastTime;
    }

    public void setBreakfastTime(String breakfastTime) {
        this.breakfastTime = breakfastTime;
    }

    public String getLunchTime() {
        return lunchTime;
    }

    public void setLunchTime(String lunchTime) {
        this.lunchTime = lunchTime;
    }

    public String getDinnerTime() {
        return dinnerTime;
    }

    public void setDinnerTime(String dinnerTime) {
        this.dinnerTime = dinnerTime;
    }

    public String getBedtime() {
        return bedtime;
    }

    public void setBedtime(String bedtime) {
        this.bedtime = bedtime;
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
}
