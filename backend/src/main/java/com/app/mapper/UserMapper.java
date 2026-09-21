package com.app.mapper;

import com.app.domain.User;
import org.apache.ibatis.annotations.Param;

public interface UserMapper {

    int countByLoginId(@Param("loginId") String loginId);

    int countByEmail(@Param("email") String email);

    int countByNickname(@Param("nickname") String nickname);

    int countByNicknameExceptLoginId(@Param("nickname") String nickname, @Param("loginId") String loginId);

    User findByLoginId(@Param("loginId") String loginId);

    User findById(@Param("userId") Long userId);

    User findByEmail(@Param("email") String email);

    int updatePasswordHash(@Param("loginId") String loginId, @Param("passwordHash") String passwordHash);

    int updateNickname(@Param("loginId") String loginId, @Param("nickname") String nickname);

    int updateProfileImageUrl(@Param("loginId") String loginId, @Param("profileImageUrl") String profileImageUrl);

    int updateMealTimes(@Param("userId") Long userId,
                        @Param("loginId") String loginId,
                        @Param("breakfastTime") String breakfastTime,
                        @Param("lunchTime") String lunchTime,
                        @Param("dinnerTime") String dinnerTime,
                        @Param("bedtime") String bedtime);

    int insertUser(User user);
}
